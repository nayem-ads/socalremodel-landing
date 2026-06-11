const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fallback to individual env vars if DATABASE_URL is not set
  host:     process.env.PGHOST,
  port:     process.env.PGPORT     ? parseInt(process.env.PGPORT, 10) : 5432,
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── API: POST /api/leads ──────────────────────────────────────────────────────
app.post('/api/leads', async (req, res) => {
  const { name, email, phone, project_type } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const sanitized = {
    name:         name.trim().slice(0, 255),
    email:        email.trim().toLowerCase().slice(0, 255),
    phone:        phone        ? String(phone).trim().slice(0, 50)  : null,
    project_type: project_type ? String(project_type).trim().slice(0, 100) : null,
  };

  try {
    const result = await pool.query(
      `INSERT INTO leads (name, email, phone, project_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, email, created_at`,
      [sanitized.name, sanitized.email, sanitized.phone, sanitized.project_type]
    );

    const lead = result.rows[0];
    console.log(`[leads] Saved lead #${lead.id} — ${lead.name} <${lead.email}>`);

    return res.status(201).json({
      success: true,
      lead_id: lead.id,
      message: 'Lead saved successfully.',
    });
  } catch (err) {
    console.error('[leads] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to save lead. Please try again.' });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] SoCal Remodel Quotes running on port ${PORT}`);
});
