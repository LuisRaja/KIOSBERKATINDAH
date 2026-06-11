const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { adminLogin, generateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: path.resolve(__dirname, '..', 'public', 'uploads'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `prod-${Date.now()}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/login', (req, res) => {
    if (req.session?.adminToken) {
        return res.redirect('/admin');
    }
    res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

    if (!admin || !bcrypt.compareSync(password, admin.password)) {
        return res.render('admin/login', { error: 'Username atau password salah' });
    }

    const token = generateToken({ id: admin.id, username: admin.username });
    req.session.adminToken = token;
    res.redirect('/admin');
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

router.get('/', adminLogin, (req, res) => {
    const db = getDb();
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE payment_status = 'paid'").get().total;
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all();
    const storeClosed = db.prepare("SELECT value FROM store_settings WHERE key = 'store_closed'").get();

    res.render('admin/index', {
        totalProducts, totalOrders, pendingOrders, totalRevenue, recentOrders, admin: req.admin,
        storeClosed: storeClosed ? storeClosed.value : '0'
    });
});

router.get('/products', adminLogin, (req, res) => {
    const db = getDb();
    const products = db.prepare(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.id 
        ORDER BY p.code ASC
    `).all();
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('admin/products', { products, categories, admin: req.admin });
});

router.post('/products', adminLogin, upload.single('image'), (req, res) => {
    const db = getDb();
    const { code, name, category_id, price, cost_price, stock, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const existing = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
    if (existing) {
        return res.status(400).json({ error: 'Kode produk sudah ada' });
    }

    db.prepare(`
        INSERT INTO products (code, category_id, name, price, cost_price, stock, description, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, category_id, name, parseInt(price), parseInt(cost_price || 0), parseInt(stock), description || '', image);

    res.json({ success: true, message: 'Produk berhasil ditambahkan' });
});

router.put('/products/:id', adminLogin, upload.single('image'), (req, res) => {
    const db = getDb();
    const { name, category_id, price, cost_price, stock, description, is_active } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    let image = product.image;
    if (req.file) {
        image = `/uploads/${req.file.filename}`;
    }

    db.prepare(`
        UPDATE products 
        SET name = ?, category_id = ?, price = ?, cost_price = ?, stock = ?, description = ?, image = ?, 
            is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(name, category_id, parseInt(price), parseInt(cost_price || 0), parseInt(stock), description || '', image, is_active || 1, req.params.id);

    res.json({ success: true, message: 'Produk berhasil diupdate' });
});

router.delete('/products/:id', adminLogin, (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM order_items WHERE product_id = ?').run(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
});

router.get('/orders', adminLogin, (req, res) => {
    const db = getDb();
    const status = req.query.status || '';

    let sql = 'SELECT o.*, u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id = u.id';
    const params = [];
    if (status) {
        sql += ' WHERE o.status = ?';
        params.push(status);
    }
    sql += ' ORDER BY o.created_at DESC';

    const orders = db.prepare(sql).all(...params);
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }

    res.render('admin/orders', { orders, currentStatus: status, admin: req.admin });
});

router.get('/api/pending-count', adminLogin, (req, res) => {
    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
    res.json({ count });
});

router.put('/orders/:id/status', adminLogin, (req, res) => {
    const db = getDb();
    const { status } = req.body;
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: 'Status pesanan diupdate' });
});

router.put('/orders/:id/pay', adminLogin, (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
    db.prepare(`
        UPDATE orders SET payment_status = 'paid', payment_method = 'QRIS', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(req.params.id);
    res.json({ success: true, message: 'Pembayaran dikonfirmasi' });
});

router.get('/orders/:id/nota', adminLogin, (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const settings = db.prepare('SELECT * FROM store_settings').all();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.render('admin/nota', { order, settings: map });
});

router.get('/settings', adminLogin, (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM store_settings').all();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.render('admin/settings', { settings: map, admin: req.admin, message: null, error: null });
});

router.post('/settings', adminLogin, upload.single('qris_image'), (req, res) => {
    const db = getDb();
    const { store_name, whatsapp_number, store_address, store_hours, qris_name, store_closed, announcement_text } = req.body;
    const upsert = db.prepare('INSERT OR REPLACE INTO store_settings (key, value) VALUES (?, ?)');
    upsert.run('store_name', store_name || '');
    upsert.run('whatsapp_number', whatsapp_number || '');
    upsert.run('store_address', store_address || '');
    upsert.run('store_hours', store_hours || '');
    upsert.run('qris_name', qris_name || '');
    upsert.run('store_closed', store_closed === 'on' ? '1' : '0');
    upsert.run('announcement_text', announcement_text || '');
    if (req.file) {
        upsert.run('qris_image', '/uploads/' + req.file.filename);
    }
    const settings = db.prepare('SELECT * FROM store_settings').all();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.render('admin/settings', { settings: map, admin: req.admin, message: 'Pengaturan berhasil disimpan', error: null });
});

router.post('/reset-password', adminLogin, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM store_settings').all();
        const map = {};
        for (const s of settings) map[s.key] = s.value;
        return res.render('admin/settings', { settings: map, admin: req.admin, message: null, error: 'Password lama dan baru wajib diisi' });
    }
    if (new_password.length < 6) {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM store_settings').all();
        const map = {};
        for (const s of settings) map[s.key] = s.value;
        return res.render('admin/settings', { settings: map, admin: req.admin, message: null, error: 'Password baru minimal 6 karakter' });
    }
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin || !bcrypt.compareSync(current_password, admin.password)) {
        const settings = db.prepare('SELECT * FROM store_settings').all();
        const map = {};
        for (const s of settings) map[s.key] = s.value;
        return res.render('admin/settings', { settings: map, admin: req.admin, message: null, error: 'Password lama salah' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hash, req.admin.id);
    const settings = db.prepare('SELECT * FROM store_settings').all();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.render('admin/settings', { settings: map, admin: req.admin, message: 'Password berhasil diubah', error: null });
});

router.get('/users', adminLogin, (req, res) => {
    const db = getDb();
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.render('admin/users', { users, admin: req.admin, message: null, error: null });
});

router.post('/users/create', adminLogin, (req, res) => {
    const { name, email, phone, password } = req.body;
    const db = getDb();
    if (!name || !password) {
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        return res.render('admin/users', { users, admin: req.admin, message: null, error: 'Nama dan password wajib diisi' });
    }
    if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
            return res.render('admin/users', { users, admin: req.admin, message: null, error: 'Email sudah terdaftar' });
        }
    }
    if (phone) {
        const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
        if (existing) {
            const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
            return res.render('admin/users', { users, admin: req.admin, message: null, error: 'Nomor telepon sudah terdaftar' });
        }
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)').run(name, email || '', phone || '', hash);
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.render('admin/users', { users, admin: req.admin, message: 'User berhasil ditambahkan', error: null });
});

router.post('/users/reset-password', adminLogin, (req, res) => {
    const { user_id, new_password } = req.body;
    const db = getDb();
    if (!user_id || !new_password || new_password.length < 6) {
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        return res.render('admin/users', { users, admin: req.admin, message: null, error: 'Password minimal 6 karakter' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user_id);
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.render('admin/users', { users, admin: req.admin, message: 'Password user berhasil direset', error: null });
});

router.post('/users/delete', adminLogin, (req, res) => {
    const { user_id } = req.body;
    const db = getDb();
    db.prepare('DELETE FROM users WHERE id = ?').run(user_id);
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.render('admin/users', { users, admin: req.admin, message: 'User berhasil dihapus', error: null });
});

router.post('/orders/cleanup', adminLogin, (req, res) => {
    const { days } = req.body;
    const db = getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (parseInt(days) || 30));
    const dateStr = cutoff.toISOString();
    const deleted = db.prepare("DELETE FROM orders WHERE created_at < ? AND status = 'done'").run(dateStr);
    res.json({ success: true, message: `${deleted.changes} pesanan lama berhasil dihapus` });
});

router.get('/revenue', adminLogin, (req, res) => {
    const db = getDb();
    const filter = req.query.filter || 'all';

    let dateCondition = '';
    if (filter === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        dateCondition = `AND DATE(o.created_at) = '${today}'`;
    } else if (filter === 'month') {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        dateCondition = `AND strftime('%Y-%m', o.created_at) = '${year}-${month}'`;
    }

    const revenueRow = db.prepare(`
        SELECT COALESCE(SUM(o.total), 0) as total_revenue, COUNT(*) as total_orders
        FROM orders o
        WHERE o.payment_status = 'paid' AND o.status = 'completed' ${dateCondition}
    `).get();

    const costRow = db.prepare(`
        SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0) as total_cost
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.payment_status = 'paid' AND o.status = 'completed' ${dateCondition}
    `).get();

    const revenue = revenueRow.total_revenue;
    const cost = costRow.total_cost;
    const profit = revenue - cost;

    const dailyStats = db.prepare(`
        SELECT DATE(o.created_at) as date, COALESCE(SUM(o.total), 0) as revenue, COUNT(*) as orders
        FROM orders o
        WHERE o.payment_status = 'paid' AND o.status = 'completed'
        GROUP BY DATE(o.created_at)
        ORDER BY date DESC LIMIT 30
    `).all();

    res.render('admin/revenue', {
        admin: req.admin,
        revenue, cost, profit,
        totalOrders: revenueRow.total_orders,
        filter, dailyStats
    });
});

router.post('/api/revenue/reset', adminLogin, (req, res) => {
    const db = getDb();
    const deleted = db.prepare("DELETE FROM orders WHERE payment_status = 'paid' AND status = 'completed'").run();
    res.json({ success: true, message: `${deleted.changes} pesanan berhasil dihapus. Pendapatan di-reset.` });
});

module.exports = router;
