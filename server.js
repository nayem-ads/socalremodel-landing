const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

// Create table on startup if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    project_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => {
  console.log('Database initialized: "leads" table is ready.');
}).catch((err) => {
  console.error('Failed to initialize database table:', err.message);
});


// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── POST /api/leads ───────────────────────────────────────────────────────────
app.post('/api/leads', async (req, res) => {
  const { name, email, phone, project_type } = req.body;

  // Validate required fields
  if (!name || !email || !phone || !project_type) {
    return res.status(400).json({
      error: 'Missing required fields: name, email, phone, project_type',
    });
  }

  // Basic email format check
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (name, email, phone, project_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), project_type.trim()]
    );

    return res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('[/api/leads] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to save lead. Please try again.' });
  }
});

// ── FALLBACK → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SoCal Remodel server running on port ${PORT}`);
});
