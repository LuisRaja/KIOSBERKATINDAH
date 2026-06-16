const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('data/kios.db');

// Check schema
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='store_settings'").get();
console.log('Schema:', schema?.sql);

// Copy barcode.png to public/uploads/
const src = path.resolve(__dirname, '..', 'barcode.png');
const dest = path.resolve(__dirname, '..', 'public', 'uploads', 'barcode.png');

if (!fs.existsSync(src)) {
    console.error('barcode.png not found at:', src);
    process.exit(1);
}

fs.copyFileSync(src, dest);
console.log('Copied barcode.png to public/uploads/barcode.png');

// Update database settings
const upsert = db.prepare(`
    INSERT INTO store_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

upsert.run('qris_image', '/uploads/barcode.png');
upsert.run('qris_name', 'Kios Berkat Indah');
console.log('QRIS config updated in database');

// Verify
const check = db.prepare("SELECT * FROM store_settings WHERE key IN ('qris_image','qris_name')").all();
console.log('Current settings:', JSON.stringify(check, null, 2));

db.close();
console.log('Done!');
