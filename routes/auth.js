const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getDb } = require('../db/schema');

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

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const db = getDb();
    done(null, db.prepare('SELECT * FROM users WHERE id = ?').get(id));
});

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ success: false, error: 'Belum login' });
}

router.post('/register', (req, res) => {
    const { email, password, name, phone } = req.body;
    const db = getDb();
    if (!password || !name) {
        return res.status(400).json({ success: false, error: 'Nama, dan password wajib diisi' });
    }
    if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(400).json({ success: false, error: 'Email sudah terdaftar' });
    }
    if (phone) {
        if (!/^08\d{8,11}$/.test(phone.replace(/\D/g, ''))) {
            return res.status(400).json({ success: false, error: 'Nomor telepon tidak valid (harus 08xx, min. 10 digit)' });
        }
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

router.post('/login', (req, res) => {
    const { email, phone, password } = req.body;
    if ((!email && !phone) || !password) {
        return res.status(400).json({ success: false, error: 'Email/nomor telepon dan password wajib diisi' });
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

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logout berhasil' });
    });
});

router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/' }),
    (req, res) => {
        req.session.userId = req.user.id;
        res.redirect(process.env.APP_URL || '/');
    }
);

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