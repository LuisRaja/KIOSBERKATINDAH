const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db/schema');
const { sendOrderNotification, sendPaymentProofNotification } = require('../utils/email');
const { isAuthenticated } = require('./auth');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.resolve(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `bukti-${req.params.orderNumber}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function generateOrderNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `KBI-${dateStr}-${rand}`;
}

router.post('/', (req, res) => {
    const db = getDb();
    const { customerName, customerPhone, pickupDate, pickupTime, shippingMethod, shippingAddress, notes, items } = req.body;
    const userId = req.session && req.session.userId ? req.session.userId : null;

    if (!customerName || !customerPhone || !pickupDate || !pickupTime || !items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Data pesanan tidak lengkap' });
    }

    const storeClosed = db.prepare("SELECT value FROM store_settings WHERE key = 'store_closed'").get();
    if (storeClosed && storeClosed.value === '1') {
        return res.status(400).json({ success: false, error: 'Maaf, kios sedang tutup sementara. Pesanan tidak dapat diproses saat ini.' });
    }

    if (!/^08\d{8,11}$/.test(customerPhone.replace(/\D/g, ''))) {
        return res.status(400).json({ success: false, error: 'Nomor telepon tidak valid (harus 08xx, min. 10 digit)' });
    }

    let customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(customerPhone);
    if (!customer) {
        const result = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(customerName, customerPhone);
        customer = { id: result.lastInsertRowid };
    } else {
        db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(customerName, customer.id);
    }

    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.productId);
        if (!product) {
            return res.status(400).json({ success: false, error: `Produk ID ${item.productId} tidak ditemukan` });
        }
        if (product.stock < item.quantity) {
            return res.status(400).json({
                success: false,
                error: `Stok ${product.name} tersisa ${product.stock}, tidak mencukupi`
            });
        }
        const itemSubtotal = product.price * item.quantity;
        subtotal += itemSubtotal;
        orderItems.push({
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            quantity: item.quantity,
            subtotal: itemSubtotal
        });
    }

    const shippingCost = 0;
    const total = subtotal + shippingCost;
    const orderNumber = generateOrderNumber();

    const insertOrder = db.prepare(`
        INSERT INTO orders (order_number, user_id, customer_id, customer_name, customer_phone, 
            pickup_date, pickup_time, shipping_method, shipping_address, 
            subtotal, shipping_cost, total, status, payment_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?)
    `);

    const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    const tx = db.transaction(() => {
        const result = insertOrder.run(
            orderNumber, userId, customer.id, customerName, customerPhone,
            pickupDate, pickupTime, shippingMethod || 'Ambil Sendiri', shippingAddress || '',
            subtotal, shippingCost, total, notes || ''
        );

        const orderId = result.lastInsertRowid;
        for (const item of orderItems) {
            insertItem.run(orderId, item.productId, item.productName, item.productPrice, item.quantity, item.subtotal);
            updateStock.run(item.quantity, item.productId);
        }

        return orderId;
    });

    const orderId = tx();

    const order = db.prepare(`
        SELECT o.*, GROUP_CONCAT(oi.product_name || '||' || oi.quantity || '||' || oi.product_price || '||' || oi.subtotal, ';;') as items_raw
        FROM orders o 
        LEFT JOIN order_items oi ON o.id = oi.order_id 
        WHERE o.id = ?
        GROUP BY o.id
    `).get(orderId);

    const fullOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    sendOrderNotification(fullOrder, orderItems);

    res.json({
        success: true,
        data: {
            ...order,
            items: orderItems
        },
        message: 'Pesanan berhasil dibuat'
    });
});

router.get('/user/orders', isAuthenticated, (req, res) => {
    const db = getDb();
    const orders = db.prepare(`
        SELECT o.* FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC
    `).all(req.session.userId);
    const result = orders.map(order => {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        return { ...order, items };
    });
    res.json({ success: true, data: result });
});

router.get('/:orderNumber', (req, res) => {
    const db = getDb();
    const order = db.prepare(`
        SELECT o.*, c.name as customer_name_record
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.order_number = ?
    `).get(req.params.orderNumber);

    if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ success: true, data: { ...order, items } });
});

router.put('/:orderNumber/pay', (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
    }
    const method = req.body.payment_method || 'Tunai';
    db.prepare(`
        UPDATE orders SET payment_status = 'paid', payment_method = ?, updated_at = CURRENT_TIMESTAMP
        WHERE order_number = ?
    `).run(method, req.params.orderNumber);
    res.json({ success: true, message: 'Pembayaran dikonfirmasi' });
});

router.post('/:orderNumber/upload-proof', upload.single('proof'), (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'File bukti bayar wajib diupload' });
    }
    const proofPath = '/uploads/' + req.file.filename;
    db.prepare("UPDATE orders SET payment_proof = ?, payment_status = 'paid', payment_method = 'QRIS', updated_at = CURRENT_TIMESTAMP WHERE order_number = ?")
        .run(proofPath, req.params.orderNumber);
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    sendPaymentProofNotification(updatedOrder, req.file.path);
    res.json({ success: true, message: 'Bukti bayar berhasil diupload', data: { payment_proof: proofPath } });
});

router.get('/qris/config', (req, res) => {
    const db = getDb();
    const qrisName = db.prepare("SELECT value FROM store_settings WHERE key = 'qris_name'").get();
    const qrisImage = db.prepare("SELECT value FROM store_settings WHERE key = 'qris_image'").get();
    res.json({
        success: true,
        data: {
            name: qrisName ? qrisName.value : '',
            image: qrisImage ? qrisImage.value : '',
        }
    });
});

module.exports = router;
