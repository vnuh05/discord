const Database = require('better-sqlite3');
const db = new Database('shop.db');
console.log('tables:', db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all());
console.log('orders example:', db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all());
console.log('orders count:', db.prepare('SELECT COUNT(*) as c FROM orders').get().c);
