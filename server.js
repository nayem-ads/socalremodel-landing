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

// ── EMAIL NOTIFICATION (RESEND) ────────────────────────────────────────────────
async function sendLeadEmail(name, email, phone, projectType) {
  const apiKey = process.env.RESEND_API_KEY || 're_gLMUzdFN_C4GTQzyfwaeSvcxYvWQZStvW';
  const recipient = process.env.LEAD_NOTIFICATION_EMAIL || 'nayem.adsmanager@gmail.com';

  if (!apiKey) {
    console.log('[Resend] API key not found. Skipping email notification.');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SoCal Remodel Quotes <onboarding@resend.dev>',
        to: recipient,
        subject: `New Lead: ${name} (${projectType})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0b1329; padding: 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px;">🏠 New SoCal Remodel Lead</h2>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
              <p style="margin-top: 0; font-size: 16px;">You have received a new remodeling quote request:</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; width: 140px; color: #475569;">Full Name:</td>
                  <td style="padding: 10px 0; color: #0f172a;">${name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #475569;">Email Address:</td>
                  <td style="padding: 10px 0; color: #0f172a;"><a href="mailto:${email}" style="color: #f97316; text-decoration: none;">${email}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #475569;">Phone Number:</td>
                  <td style="padding: 10px 0; color: #0f172a;"><a href="tel:${phone}" style="color: #f97316; text-decoration: none;">${phone}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #475569;">Project Type:</td>
                  <td style="padding: 10px 0; color: #0f172a; text-transform: capitalize;">${projectType}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #475569;">Submitted At:</td>
                  <td style="padding: 10px 0; color: #0f172a;">${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST</td>
                </tr>
              </table>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[Resend] Error response:', errBody);
    } else {
      console.log(`[Resend] Lead notification email sent successfully to ${recipient}`);
    }
  } catch (err) {
    console.error('[Resend] Failed to send email:', err.message);
  }
}

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

    // Trigger email notification asynchronously
    sendLeadEmail(name.trim(), email.trim(), phone.trim(), project_type.trim());

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
