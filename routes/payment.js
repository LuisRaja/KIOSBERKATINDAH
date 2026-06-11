const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const Midtrans = require('midtrans-client');

function getMidtrans() {
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
    if (isProduction) {
        return new Midtrans.Snap({
            isProduction: true,
            serverKey: process.env.MIDTRANS_SERVER_KEY,
            clientKey: process.env.MIDTRANS_CLIENT_KEY
        });
    }
    return new Midtrans.Snap({
        isProduction: false,
        serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-your-sandbox-key',
        clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-your-sandbox-key'
    });
}

router.post('/create-transaction', async (req, res) => {
    const db = getDb();
    const { orderNumber } = req.body;

    if (!process.env.MIDTRANS_SERVER_KEY) {
        return res.status(400).json({
            success: false,
            error: 'Midtrans belum dikonfigurasi. Isi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di file .env'
        });
    }

    const order = db.prepare(`
        SELECT o.*, GROUP_CONCAT(oi.product_name || '||' || oi.quantity || '||' || oi.product_price || '||' || oi.subtotal, ';;') as items_raw
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.order_number = ?
        GROUP BY o.id
    `).get(orderNumber);

    if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

    const transactionDetails = {
        transaction_details: {
            order_id: orderNumber,
            gross_amount: order.total
        },
        customer_details: {
            first_name: order.customer_name,
            phone: order.customer_phone
        },
        item_details: items.map(item => ({
            id: item.product_id.toString(),
            price: item.product_price,
            quantity: item.quantity,
            name: item.product_name
        })),
        callbacks: {
            finish: `${process.env.APP_URL || 'http://localhost:3000'}/order/${orderNumber}`,
            error: `${process.env.APP_URL || 'http://localhost:3000'}/order/${orderNumber}`
        }
    };

    try {
        const snap = getMidtrans();
        const transaction = await snap.createTransaction(transactionDetails);

        db.prepare('UPDATE orders SET midtrans_order_id = ? WHERE id = ?').run(transaction.token, order.id);

        res.json({
            success: true,
            data: {
                token: transaction.token,
                redirect_url: transaction.redirect_url
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Gagal membuat transaksi: ' + error.message
        });
    }
});

router.post('/notification', (req, res) => {
    const db = getDb();
    const notificationBody = req.body;

    try {
        const snap = getMidtrans();
        const statusResponse = snap.transaction.notification(notificationBody);

        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;
        const transactionId = statusResponse.transaction_id;

        let paymentStatus = 'unpaid';
        if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
            paymentStatus = fraudStatus === 'accept' ? 'paid' : 'fraud';
        } else if (transactionStatus === 'pending') {
            paymentStatus = 'pending';
        } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
            paymentStatus = 'failed';
        }

        db.prepare(`
            UPDATE orders 
            SET payment_status = ?, midtrans_transaction_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE order_number = ?
        `).run(paymentStatus, transactionId || '', orderId);

        if (paymentStatus === 'paid') {
            db.prepare(`
                UPDATE orders 
                SET status = 'confirmed', payment_method = 'Midtrans', updated_at = CURRENT_TIMESTAMP
                WHERE order_number = ? AND status = 'pending'
            `).run(orderId);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
