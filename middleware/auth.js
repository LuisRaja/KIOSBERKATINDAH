const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SESSION_SECRET || 'kios-rahasia-berkat-indah-2026';

function adminLogin(req, res, next) {
    const token = req.session?.adminToken;
    if (!token) {
        return res.redirect('/admin/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (e) {
        req.session.destroy();
        return res.redirect('/admin/login');
    }
}

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function apiAuth(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = { adminLogin, generateToken, apiAuth };
