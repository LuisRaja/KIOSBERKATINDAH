const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function getDb() {
    if (db) return db;

    const dbDir = path.resolve(__dirname, '..', 'data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(path.join(dbDir, 'kios.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
    seedProducts();
    seedAdmin();

    return db;
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0,
            description TEXT DEFAULT '',
            image TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT,
            google_id TEXT,
            name TEXT NOT NULL DEFAULT '',
            phone TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT NOT NULL UNIQUE,
            user_id INTEGER,
            customer_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            pickup_date TEXT NOT NULL,
            pickup_time TEXT NOT NULL,
            shipping_method TEXT NOT NULL DEFAULT 'Ambil Sendiri',
            shipping_address TEXT DEFAULT '',
            shipping_cost INTEGER NOT NULL DEFAULT 0,
            subtotal INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            payment_status TEXT NOT NULL DEFAULT 'unpaid',
            payment_method TEXT DEFAULT '',
            payment_proof TEXT DEFAULT '',
            midtrans_order_id TEXT,
            midtrans_transaction_id TEXT,
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            subtotal INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS store_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    try { db.exec("ALTER TABLE orders ADD COLUMN payment_proof TEXT DEFAULT ''"); } catch (e) {}
    try { db.exec("ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN google_id TEXT"); } catch (e) {}
    try { db.exec("ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
    try { db.exec("ALTER TABLE orders ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
}

function seedProducts() {
    const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
    if (count.count > 0) return;

    const categories = [
        'Makanan', 'Sembako', 'Mie Instan', 'Bumbu Instan',
        'Kopi & Rokok', 'Permen & Camilan', 'Kebutuhan Rumah'
    ];

    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
    for (const cat of categories) {
        insertCat.run(cat, cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }

    const catMap = {};
    const allCats = db.prepare('SELECT id, name FROM categories').all();
    for (const c of allCats) {
        catMap[c.name] = c.id;
    }

    const products = [
        { code: 'P01', kategori: 'Makanan', nama: 'Nasi Bungkus Lengkap Spesial Kios', harga: 5000, stok: 20 },
        { code: 'P02', kategori: 'Sembako', nama: 'Beras Premium Slyp Super 1kg', harga: 15000, stok: 50 },
        { code: 'P03', kategori: 'Sembako', nama: 'Beras Premium Slyp Super 5kg', harga: 72500, stok: 30 },
        { code: 'P04', kategori: 'Sembako', nama: 'Minyak Goreng Bimoli 1 Liter Refill', harga: 21000, stok: 40 },
        { code: 'P05', kategori: 'Sembako', nama: 'Minyak Goreng Bimoli 2 Liter Pouch', harga: 41500, stok: 25 },
        { code: 'P06', kategori: 'Sembako', nama: 'Gula Pasir Putih Premium 1kg', harga: 17500, stok: 50 },
        { code: 'P07', kategori: 'Sembako', nama: 'Gula Pasir Gulaku Kemasan Hijau 1kg', harga: 18500, stok: 40 },
        { code: 'P08', kategori: 'Sembako', nama: 'Telur Ayam Ras Segar (Per Butir)', harga: 2500, stok: 200 },
        { code: 'P09', kategori: 'Sembako', nama: 'Telur Ayam Ras Segar (1 Mika Isi 10)', harga: 24000, stok: 30 },
        { code: 'P10', kategori: 'Mie Instan', nama: 'Indomie Mi Goreng Spesial', harga: 3500, stok: 100 },
        { code: 'P11', kategori: 'Mie Instan', nama: 'Indomie Rasa Soto Mie (Kuah)', harga: 3300, stok: 100 },
        { code: 'P12', kategori: 'Mie Instan', nama: 'Mie Sedaap Goreng Original', harga: 3500, stok: 80 },
        { code: 'P13', kategori: 'Mie Instan', nama: 'Mie Sedaap Rasa Soto Segar', harga: 3300, stok: 80 },
        { code: 'P14', kategori: 'Sembako', nama: 'Garam Dapur Beriodium Halus 250g', harga: 3000, stok: 60 },
        { code: 'P15', kategori: 'Sembako', nama: 'Tepung Terigu Segitiga Biru 1kg', harga: 14500, stok: 40 },
        { code: 'P16', kategori: 'Sembako', nama: 'Tepung Tapioka Rose Brand 500g', harga: 8000, stok: 35 },
        { code: 'P17', kategori: 'Sembako', nama: 'Mentega Blue Band Serbaguna 200g Sachet', harga: 9000, stok: 45 },
        { code: 'P18', kategori: 'Sembako', nama: 'Susu Kental Manis Frisian Flag Cokelat Kaleng', harga: 12500, stok: 30 },
        { code: 'P19', kategori: 'Sembako', nama: 'Susu Kental Manis Cap Enak Putih Kaleng', harga: 11800, stok: 30 },
        { code: 'P20', kategori: 'Bumbu Instan', nama: 'Masako Rasa Ayam Renteng (10 Sachet)', harga: 5000, stok: 80 },
        { code: 'P21', kategori: 'Bumbu Instan', nama: 'Royco Rasa Sapi Renteng (10 Sachet)', harga: 5000, stok: 80 },
        { code: 'P22', kategori: 'Bumbu Instan', nama: 'Sasa Penyedap Rasa MSG Premium 100g', harga: 4500, stok: 60 },
        { code: 'P23', kategori: 'Bumbu Instan', nama: 'Terasi Udang ABC Gurih (Pack Isi 10)', harga: 6500, stok: 40 },
        { code: 'P24', kategori: 'Bumbu Instan', nama: 'Kecap Manis ABC Refill Pouch 225ml', harga: 9500, stok: 35 },
        { code: 'P25', kategori: 'Bumbu Instan', nama: 'Kecap Manis Bango Sachet 60ml', harga: 3000, stok: 100 },
        { code: 'P26', kategori: 'Bumbu Instan', nama: 'Saus Sambal ABC Botol Kecil 135ml', harga: 8500, stok: 40 },
        { code: 'P27', kategori: 'Bumbu Instan', nama: 'Saus Tomat Indofood Botol', harga: 7500, stok: 40 },
        { code: 'P28', kategori: 'Kopi & Rokok', nama: 'Kopi Lokal Ende Hitam Bubuk Tradisional', harga: 15000, stok: 30 },
        { code: 'P29', kategori: 'Kopi & Rokok', nama: 'Rokok Sampoerna A Mild Kotak Putih 16', harga: 34000, stok: 20 },
        { code: 'P30', kategori: 'Kopi & Rokok', nama: 'Rokok Gudang Garam Filter International 12', harga: 25000, stok: 20 },
        { code: 'P31', kategori: 'Kopi & Rokok', nama: 'Rokok Gudang Garam Surya Eksklusif 16', harga: 33000, stok: 15 },
        { code: 'P32', kategori: 'Kopi & Rokok', nama: 'Rokok Djarum Super Filter Cengkeh 12', harga: 24000, stok: 20 },
        { code: 'P33', kategori: 'Kopi & Rokok', nama: 'Rokok Marlboro Red Premium Pack 20', harga: 42000, stok: 15 },
        { code: 'P34', kategori: 'Kopi & Rokok', nama: 'Korek Api Gas Tokai Original Awet', harga: 3500, stok: 50 },
        { code: 'P35', kategori: 'Permen & Camilan', nama: 'Permen Kopiko Kantong Isi 50 Butir', harga: 8000, stok: 40 },
        { code: 'P36', kategori: 'Permen & Camilan', nama: 'Permen Relaxa Wangi Barley Mint', harga: 7500, stok: 40 },
        { code: 'P37', kategori: 'Permen & Camilan', nama: 'Permen Sugus Kotak Rasa Buah Campur', harga: 6000, stok: 50 },
        { code: 'P38', kategori: 'Sembako', nama: 'Gula Merah Sawi Aren Tradisional', harga: 6000, stok: 30 },
        { code: 'P39', kategori: 'Sembako', nama: 'Bihun Jagung Pilihan Dua Dara 300g', harga: 7000, stok: 35 },
        { code: 'P40', kategori: 'Permen & Camilan', nama: 'Biskuit Roma Kelapa Original Kios 300g', harga: 11500, stok: 25 },
        { code: 'P41', kategori: 'Permen & Camilan', nama: 'Biskuit Khong Guan Mini Asorti Kaleng', harga: 24500, stok: 15, image: 'image_5e6104.jpg' },
        { code: 'P42', kategori: 'Sembako', nama: 'Susu Bubuk Dancow Fortigro Cokelat 400g', harga: 48500, stok: 20 },
        { code: 'P43', kategori: 'Kebutuhan Rumah', nama: 'Sabun Cuci Piring Mama Lemon Jeruk Nipis', harga: 13500, stok: 30 },
        { code: 'P44', kategori: 'Kebutuhan Rumah', nama: 'Sabun Cuci Piring Sunlight Ekstrak Mint', harga: 5500, stok: 40 },
        { code: 'P45', kategori: 'Kebutuhan Rumah', nama: 'Deterjen Rinso Anti Noda Cair Premium', harga: 19500, stok: 25 },
        { code: 'P46', kategori: 'Kebutuhan Rumah', nama: 'Deterjen Boom Bubuk Wangi Ekonomi 315g', harga: 6500, stok: 35 },
        { code: 'P47', kategori: 'Kebutuhan Rumah', nama: 'Pembersih Lantai Wipol Karbol Wangi Pine', harga: 15500, stok: 20 },
        { code: 'P48', kategori: 'Kebutuhan Rumah', nama: 'Tissue Paseo Facial Smart Pack 250 Sheets', harga: 14000, stok: 30 },
        { code: 'P49', kategori: 'Kebutuhan Rumah', nama: 'Batu Baterai ABC Alkaline AA Hitam (Isi 2)', harga: 12500, stok: 25 },
        { code: 'P50', kategori: 'Kebutuhan Rumah', nama: 'Batu Baterai ABC Alkaline AAA Hitam (Isi 2)', harga: 12500, stok: 25 }
    ];

    const insertProd = db.prepare(`
        INSERT INTO products (code, category_id, name, price, stock, image, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
        for (const p of products) {
            insertProd.run(p.code, catMap[p.kategori], p.nama, p.harga, p.stok, p.image || null, '');
        }
    });
    tx();
}

function seedAdmin() {
    const count = db.prepare('SELECT COUNT(*) as count FROM admins').get();
    if (count.count > 0) return;

    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('kios123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hash);

    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('store_name', 'Kios Berkat Indah');
    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('whatsapp_number', '6281246005284');
    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('store_address', 'Sebelah kanan SMPS Rewarangga, Jl. Alternatif ke Maumere');
    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('store_hours', 'Setiap Hari: 24 Jam');
    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('store_closed', '0');
    db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)').run('announcement_text', '');
}

module.exports = { getDb };
