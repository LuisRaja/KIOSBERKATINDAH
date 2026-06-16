const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/schema');
const { generateToken } = require('../middleware/auth');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Terlalu banyak percobaan login, coba lagi 15 menit' },
    standardHeaders: true,
    legacyHeaders: false,
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);
    if (!user) {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (email) {
            user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (user) {
                db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(profile.id, user.id);
            }
        }
        if (!user) {
            const result = db.prepare('INSERT INTO users (email, google_id, name) VALUES (?, ?, ?)').run(
                email || '',
                profile.id,
                profile.displayName || ''
            );
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        }
    }
    return done(null, user);
}));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const db = getDb();
    done(null, db.prepare('SELECT * FROM users WHERE id = ?').get(id));
});

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ success: false, error: 'Belum login' });
}

router.post('/register', authLimiter, [
    body('name').trim().notEmpty().withMessage('Nama wajib diisi').isLength({ max: 100 }),
    body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
    body('phone').optional({ values: 'falsy' }).matches(/^08\d{8,11}$/).withMessage('Nomor telepon tidak valid (harus 08xx, min. 10 digit)'),
    body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const { email, password, name, phone } = req.body;
    const db = getDb();
    if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(400).json({ success: false, error: 'Email sudah terdaftar' });
    }
    if (phone) {
        const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
        if (existing) return res.status(400).json({ success: false, error: 'Nomor telepon sudah terdaftar' });
    }
    if (!email && !phone) {
        return res.status(400).json({ success: false, error: 'Email atau nomor telepon wajib diisi' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)').run(email || '', hash, name, phone || '');
    req.session.userId = result.lastInsertRowid;
    const user = db.prepare('SELECT id, email, name, phone FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: user, message: 'Registrasi berhasil' });
});

router.post('/login', authLimiter, [
    body('password').notEmpty().withMessage('Password wajib diisi'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const { email, phone, password } = req.body;
    if (!email && !phone) {
        return res.status(400).json({ success: false, error: 'Email/nomor telepon wajib diisi' });
    }
    const db = getDb();
    let user;
    if (email) {
        user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    } else {
        user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    }
    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, error: 'Email/nomor telepon atau password salah' });
    }
    req.session.userId = user.id;
    res.json({
        success: true,
        data: { id: user.id, email: user.email, name: user.name, phone: user.phone },
        message: 'Login berhasil'
    });
});

router.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
        return res.status(401).json({ success: false, error: 'Username atau password salah' });
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.SESSION_SECRET || 'kios-rahasia-berkat-indah-2026', { expiresIn: '8h' });
    req.session.adminToken = token;
    res.json({ success: true, message: 'Login admin berhasil', data: { username: admin.username } });
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logout berhasil' });
    });
});

router.get('/session', (req, res) => {
    const result = { buyer: false, admin: false };
    if (req.session && req.session.userId) {
        result.buyer = true;
    }
    if (req.session && req.session.adminToken) {
        result.admin = true;
    }
    res.json({ success: true, data: result });
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false, failureRedirect: '/?error=login_gagal' }, (err, user, info) => {
        if (err) {
            console.error('Google OAuth error:', err.message);
            return res.redirect('/?error=login_gagal');
        }
        if (!user) {
            return res.redirect('/?error=login_gagal');
        }
        req.session.userId = user.id;
        const adminEmail = process.env.ADMIN_GOOGLE_EMAIL || 'louyzhradja86@gmail.com';
        if (user.email === adminEmail) {
            const token = generateToken({ id: user.id, username: user.email });
            req.session.adminToken = token;
            return res.redirect('/admin');
        }
        const redirectUrl = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '/');
        res.redirect(redirectUrl);
    })(req, res, next);
});
}

router.get('/admin-profile', (req, res) => {
    if (!req.session || !req.session.adminToken) {
        return res.status(401).json({ success: false, error: 'Belum login sebagai admin' });
    }
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.session.adminToken, process.env.SESSION_SECRET || 'kios-rahasia-berkat-indah-2026');
        return res.json({ success: true, data: { id: decoded.id, username: decoded.username } });
    } catch {
        return res.status(401).json({ success: false, error: 'Session admin tidak valid' });
    }
});

router.get('/profile', isAuthenticated, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, email, name, phone FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
    res.json({ success: true, data: user });
});

router.put('/update-profile', isAuthenticated, (req, res) => {
    const db = getDb();
    const { name, currentPassword, newPassword } = req.body;
    if (name) {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.session.userId);
    }
    if (currentPassword && newPassword) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
        if (!user.password || !bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(400).json({ success: false, error: 'Password lama salah' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter' });
        }
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.session.userId);
    }
    if (!name && !currentPassword && !newPassword) {
        return res.status(400).json({ success: false, error: 'Tidak ada data yang diubah' });
    }
    const user = db.prepare('SELECT id, email, name, phone FROM users WHERE id = ?').get(req.session.userId);
    res.json({ success: true, data: user, message: 'Profil berhasil diubah' });
});

module.exports = { router, isAuthenticated };