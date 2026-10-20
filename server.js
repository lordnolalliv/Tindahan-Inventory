import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'tindahan.db');
const publicDir = path.join(__dirname, 'public');
const usePostgres = Boolean(process.env.DATABASE_URL);
const { Pool } = pg;

if (process.env.VERCEL && !usePostgres) {
  throw new Error('DATABASE_URL is required on Vercel. Configure your Neon connection string in Project Settings > Environment Variables.');
}

if (!usePostgres) await fs.mkdir(dataDir, { recursive: true });

const app = express();
app.use(express.json());

const frontendExists = await fs.access(path.join(publicDir, 'index.html')).then(() => true).catch(() => false);
if (frontendExists) {
  app.use(express.static(publicDir));
}

const sqlite3 = usePostgres ? null : (await import('sqlite3')).default;
const db = usePostgres
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  : new sqlite3.Database(dbPath);

const seedProducts = [
  { id: 1, name: 'Lucky Me Pancit Canton', category: 'Groceries', price: 15, stock: 42, unit: 'pack', updated: 'Today, 9:42 AM', icon: 'LM', tone: 'coral', supplier: 'Mila Foods', reorderLevel: 10, sold: 14 },
  { id: 2, name: 'Coca-Cola Sakto 290ml', category: 'Beverages', price: 20, stock: 8, unit: 'bottle', updated: 'Today, 9:15 AM', icon: 'CC', tone: 'red', supplier: 'Beverage Plus', reorderLevel: 8, sold: 11 },
  { id: 3, name: 'Surf Powder Detergent 55g', category: 'Household', price: 9, stock: 4, unit: 'sachet', updated: 'Yesterday, 4:20 PM', icon: 'SF', tone: 'blue', supplier: 'Clean Supply Co.', reorderLevel: 6, sold: 7 },
  { id: 4, name: 'Nescafe Classic 25g', category: 'Groceries', price: 49, stock: 25, unit: 'jar', updated: 'Yesterday, 1:05 PM', icon: 'NC', tone: 'coffee', supplier: 'Coffee Depot', reorderLevel: 12, sold: 8 },
  { id: 5, name: 'Gardenia Classic Bread', category: 'Fresh Goods', price: 75, stock: 0, unit: 'loaf', updated: 'Yesterday, 8:30 AM', icon: 'GB', tone: 'yellow', supplier: 'Fresh Daily', reorderLevel: 5, sold: 5 },
  { id: 6, name: 'Lucky Me Beef Noodles', category: 'Groceries', price: 14, stock: 31, unit: 'pack', updated: 'Mon, 10:12 AM', icon: 'LB', tone: 'green', supplier: 'Mila Foods', reorderLevel: 10, sold: 9 },
];

const toProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  category: row.category,
  price: Number(row.price),
  stock: Number(row.stock),
  unit: row.unit,
  supplier: row.supplier || 'Unknown',
  reorderLevel: Number(row.reorderLevel || 10),
  sold: Number(row.sold || 0),
  updated: row.updated || 'Just now',
  icon: row.icon || 'NA',
  tone: row.tone || 'coral',
  expirationDate: row.expirationDate || '',
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  if (usePostgres) {
    const query = normalizeSql(sql)
    db.query(query, params)
      .then((result) => resolve({ id: result.rows[0]?.id, changes: result.rowCount }))
      .catch(reject)
    return
  }

  db.run(sql, params, function (err) {
    if (err) {
      reject(err);
      return;
    }
    resolve({ id: this.lastID, changes: this.changes });
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  if (usePostgres) {
    db.query(normalizeSql(sql), params)
      .then((result) => resolve(result.rows))
      .catch(reject)
    return
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(rows || []);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  if (usePostgres) {
    db.query(normalizeSql(sql), params)
      .then((result) => resolve(result.rows[0] || null))
      .catch(reject)
    return
  }

  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(row || null);
  });
});

function normalizeSql(sql) {
  let parameterIndex = 0
  return sql
    .replace(/\b(reorderLevel|passwordHash|passwordSalt|createdAt|userId|expirationDate)\b/g, '"$1"')
    .replace(/\?/g, () => `$${++parameterIndex}`)
}

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, derivedKey) => {
    if (error) {
      reject(error);
      return;
    }
    resolve({ salt, hash: derivedKey.toString('hex') });
  });
});

const createToken = () => crypto.randomBytes(32).toString('hex');

const ensureDatabase = async () => {
  const idType = usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id ${idType},
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      unit TEXT NOT NULL,
      supplier TEXT,
      reorderLevel INTEGER NOT NULL DEFAULT 10,
      sold INTEGER NOT NULL DEFAULT 0,
      updated TEXT,
      icon TEXT,
      tone TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id ${idType},
      name TEXT NOT NULL UNIQUE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id ${idType},
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      createdAt TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const userCount = await get('SELECT COUNT(*) AS count FROM users');
  if (!usePostgres && Number(userCount?.count || 0) === 0) {
    const credentials = await hashPassword('admin123');
    await run(
      'INSERT INTO users (name, email, passwordHash, passwordSalt, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['Maria Reyes', 'maria@tindahan.local', credentials.hash, credentials.salt, 'owner', new Date().toISOString()]
    );
  }

  if (usePostgres) {
    await run('ALTER TABLE products ADD COLUMN IF NOT EXISTS expirationDate TEXT');
  } else {
    const productColumns = await all('PRAGMA table_info(products)');
    if (!productColumns.some((column) => column.name === 'expirationDate')) {
    await run('ALTER TABLE products ADD COLUMN expirationDate TEXT');
    }
  }

  const productCount = await get('SELECT COUNT(*) AS count FROM products');
  if (Number(productCount?.count || 0) === 0) {
    for (const product of seedProducts) {
      await run(
        `INSERT INTO products (name, category, price, stock, unit, supplier, reorderLevel, sold, updated, icon, tone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product.name, product.category, product.price, product.stock, product.unit, product.supplier, product.reorderLevel, product.sold, product.updated, product.icon, product.tone]
      );
    }
  }

  const categoriesCount = await get('SELECT COUNT(*) AS count FROM categories');
  if (Number(categoriesCount?.count || 0) === 0) {
    const categoryNames = [...new Set(seedProducts.map((product) => product.category))];
    for (const name of categoryNames) {
      await run('INSERT INTO categories (name) VALUES (?)', [name]);
    }
  }
};

await ensureDatabase();

app.get('/', (_req, res) => {
  if (frontendExists) {
    res.sendFile(path.join(publicDir, 'index.html'));
    return;
  }

  res.json({ message: 'App build not found. Run npm run build first.' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const credentials = await hashPassword(password, user.passwordSalt);
    if (credentials.hash !== user.passwordHash) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createToken();
    await run('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)', [token, user.id, new Date().toISOString()]);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to log in.', error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!name || !email || password.length < 6) {
    return res.status(400).json({ message: 'Name, email, and a password of at least 6 characters are required.' });
  }

  try {
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const credentials = await hashPassword(password);
    const userCount = await get('SELECT COUNT(*) AS count FROM users');
    const role = Number(userCount?.count || 0) === 0 ? 'owner' : 'staff';
    const result = await run(
      'INSERT INTO users (name, email, passwordHash, passwordSalt, role, createdAt) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [name, email, credentials.hash, credentials.salt, role, new Date().toISOString()]
    );
    const user = await get('SELECT * FROM users WHERE id = ?', [result.id]);
    const token = createToken();
    await run('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)', [token, user.id, new Date().toISOString()]);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to create account.', error: error.message });
  }
});

app.get('/api/auth/session', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const user = await get('SELECT users.* FROM users JOIN sessions ON sessions.userId = users.id WHERE sessions.token = ?', [token]);
    if (!user) {
      return res.status(401).json({ message: 'Session expired.' });
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify session.', error: error.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) await run('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ message: 'Signed out.' });
});

const requireAuth = async (req, res, next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const user = await get('SELECT users.* FROM users JOIN sessions ON sessions.userId = users.id WHERE sessions.token = ?', [token]);
    if (!user) {
      return res.status(401).json({ message: 'Session expired.' });
    }
    req.user = publicUser(user);
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to authenticate request.', error: error.message });
  }
};

app.use('/api/products', requireAuth);
app.use('/api/categories', requireAuth);

app.get('/api/products', async (_req, res) => {
  try {
    const rows = await all('SELECT * FROM products ORDER BY id DESC');
    res.json(rows.map(toProduct));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load products.', error: error.message });
  }
});

app.get('/api/categories', async (_req, res) => {
  try {
    const rows = await all('SELECT name FROM categories ORDER BY name ASC');
    res.json(rows.map((row) => row.name));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load categories.', error: error.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const rawName = String(req.body?.name ?? '').trim();

  if (!rawName) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  try {
    const existing = await get('SELECT name FROM categories WHERE LOWER(name) = LOWER(?)', [rawName]);
    if (existing) {
      return res.status(200).json({ name: existing.name });
    }

    const result = await run('INSERT INTO categories (name) VALUES (?) RETURNING id', [rawName]);
    res.status(201).json({ id: result.id, name: rawName });
  } catch (error) {
    res.status(500).json({ message: 'Unable to add category.', error: error.message });
  }
});

app.delete('/api/categories/:name', async (req, res) => {
  const categoryName = decodeURIComponent(req.params.name.trim());

  try {
    const existing = await get('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', [categoryName]);
    if (!existing) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    await run('DELETE FROM categories WHERE id = ?', [existing.id]);
    res.json({ message: 'Category deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete category.', error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  const payload = req.body || {};
  const product = {
    name: String(payload.name || '').trim(),
    category: String(payload.category || '').trim(),
    unit: String(payload.unit || '').trim(),
    supplier: String(payload.supplier || 'Unknown').trim(),
    price: Number(payload.price || 0),
    stock: Number(payload.stock || 0),
    reorderLevel: Number(payload.reorderLevel || 10),
    sold: Number(payload.sold || 0),
    expirationDate: String(payload.expirationDate || '').trim(),
    updated: payload.updated || 'Just now',
    icon: payload.icon || 'NA',
    tone: payload.tone || 'coral',
  };

  if (!product.name || !product.category || !product.unit) {
    return res.status(400).json({ message: 'Product name, category, and unit are required.' });
  }

  try {
    const result = await run(
      `INSERT INTO products (name, category, price, stock, unit, supplier, reorderLevel, sold, updated, icon, tone, expirationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [product.name, product.category, product.price, product.stock, product.unit, product.supplier, product.reorderLevel, product.sold, product.updated, product.icon, product.tone, product.expirationDate]
    );

    const created = await get('SELECT * FROM products WHERE id = ?', [result.id]);
    res.status(201).json(toProduct(created));
  } catch (error) {
    res.status(500).json({ message: 'Unable to create product.', error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);
  const payload = req.body || {};

  const product = {
    name: String(payload.name || '').trim(),
    category: String(payload.category || '').trim(),
    unit: String(payload.unit || '').trim(),
    supplier: String(payload.supplier || 'Unknown').trim(),
    price: Number(payload.price || 0),
    stock: Number(payload.stock || 0),
    reorderLevel: Number(payload.reorderLevel || 10),
    sold: Number(payload.sold || 0),
    expirationDate: String(payload.expirationDate || '').trim(),
    updated: payload.updated || 'Just now',
    icon: payload.icon || 'NA',
    tone: payload.tone || 'coral',
  };

  if (!product.name || !product.category || !product.unit) {
    return res.status(400).json({ message: 'Product name, category, and unit are required.' });
  }

  try {
    const existing = await get('SELECT id FROM products WHERE id = ?', [productId]);
    if (!existing) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    await run(
      `UPDATE products SET name = ?, category = ?, price = ?, stock = ?, unit = ?, supplier = ?, reorderLevel = ?, sold = ?, updated = ?, icon = ?, tone = ?, expirationDate = ? WHERE id = ?`,
      [product.name, product.category, product.price, product.stock, product.unit, product.supplier, product.reorderLevel, product.sold, product.updated, product.icon, product.tone, product.expirationDate, productId]
    );

    const updated = await get('SELECT * FROM products WHERE id = ?', [productId]);
    res.json(toProduct(updated));
  } catch (error) {
    res.status(500).json({ message: 'Unable to update product.', error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);

  try {
    const existing = await get('SELECT id FROM products WHERE id = ?', [productId]);
    if (!existing) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    await run('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ message: 'Product deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete product.', error: error.message });
  }
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tindahan backend running on http://localhost:${PORT}`);
  });
}
