const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

router.get('/', (req, res) => {
    const db = getDb();
    const category = req.query.category;
    const search = req.query.search;

    let sql = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.id 
        WHERE p.is_active = 1
    `;
    const params = [];

    if (category && category !== 'Semua') {
        sql += ' AND c.name = ?';
        params.push(category);
    }
    if (search) {
        sql += ' AND (p.name LIKE ? OR c.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY p.code ASC';

    const products = db.prepare(sql).all(...params);
    const categories = db.prepare('SELECT name FROM categories ORDER BY name').all();

    res.json({
        success: true,
        data: products,
        categories: categories.map(c => c.name)
    });
});

router.get('/categories', (req, res) => {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.json({ success: true, data: categories });
});

router.get('/:id', (req, res) => {
    const db = getDb();
    const product = db.prepare(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.id 
        WHERE p.id = ? AND p.is_active = 1
    `).get(req.params.id);

    if (!product) {
        return res.status(404).json({ success: false, error: 'Produk tidak ditemukan' });
    }
    res.json({ success: true, data: product });
});

module.exports = router;
