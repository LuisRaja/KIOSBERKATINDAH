require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const isProduction = !!(process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production');
app.set('trust proxy', isProduction ? 1 : 0);

const uploadsDir = path.resolve(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://unpkg.com", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://unpkg.com"],
            frameSrc: ["'self'", "https://www.google.com"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: isProduction
        ? ['https://kiosberkatindah-production.up.railway.app', 'https://luisraja.github.io']
        : ['http://localhost:3000', 'http://localhost:5173', 'https://luisraja.github.io'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Terlalu banyak permintaan, coba lagi nanti' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', generalLimiter);

app.use(session({
    secret: process.env.SESSION_SECRET || 'kios-rahasia-berkat-indah-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000
    }
}));
app.use(require('passport').initialize());
app.use(require('passport').session());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use(express.static(path.join(__dirname)));

const { getDb } = require('./db/schema');
getDb();

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');
const adminRouter = require('./routes/admin');
const { router: authRouter, isAuthenticated } = require('./routes/auth');

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/auth', authRouter);
app.use('/admin', adminRouter);

app.get('/api/categories', (req, res) => {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.json({ success: true, data: categories });
});

app.get('/api/store-status', (req, res) => {
    const db = getDb();
    const closed = db.prepare("SELECT value FROM store_settings WHERE key = 'store_closed'").get();
    const isOpen = !(closed && (closed.value === '1' || closed.value === 'true'));
    res.json({ isOpen });
});

app.get('/api/settings', (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM store_settings').all();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    res.json({ success: true, data: map });
});

app.get('/order/:orderNumber', (req, res) => {
    res.sendFile(path.join(__dirname, 'order-tracking.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
});

app.listen(PORT, () => {
    console.log(`Kios Berkat Indah server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
