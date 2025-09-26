// Execute on: your deployment server (file path: server.js)
const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security hardening
app.use(helmet());
app.disable('x-powered-by');
app.set('trust proxy', true); // trust reverse proxies for correct IPs

// Body parsing with small limits to reduce abuse
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Basic rate limiting (per IP) for submit
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,             // 20 requests/minute/IP
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/submit', limiter);

// ---------- Basic Auth for admin pages ----------
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'phamhuuhiep@123'; // as requested
function basicAuth(req, res, next){
  const hdr = req.headers.authorization || '';
  if(!hdr.startsWith('Basic ')){
    res.setHeader('WWW-Authenticate', 'Basic realm="Registrations"');
    return res.status(401).end('Authentication required');
  }
  const b64 = hdr.slice(6);
  let creds = '';
  try{ creds = Buffer.from(b64, 'base64').toString(); }catch(_){ }
  const idx = creds.indexOf(':');
  const user = creds.substring(0, idx);
  const pass = creds.substring(idx+1);
  if(user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Registrations"');
  return res.status(401).end('Access denied');
}

// Helper utils
function ipFrom(req){
  const cf = (req.headers['cf-connecting-ip'] || '').trim();
  const xr = (req.headers['x-real-ip'] || '').trim();
  const xffRaw = (req.headers['x-forwarded-for'] || '').trim();
  const xff = xffRaw ? xffRaw.split(',')[0].trim() : '';
  const direct = req.ip || req.socket?.remoteAddress || '';
  return cf || xr || xff || direct || 'unknown';
}
function sanitize(s, max=300){
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,max);
}

// Handle form submission
app.post('/submit', (req, res) => {
  // Honeypot check
  if (req.body.website) return res.status(400).json({ status: 'error', message: 'Bad request' });

  const name = sanitize(req.body.name, 120);
  const session = sanitize(req.body.session, 20);
  const phone = sanitize(req.body.phone, 32);
  const email = sanitize(req.body.email, 120);
  const className = sanitize(req.body.className || req.body.class, 40);
  const graduationYear = sanitize(req.body.graduationYear, 20);
  const message = sanitize(req.body.message, 1000);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneDigits = (phone||'').replace(/[^0-9]/g,'');
  const phoneOk = phoneDigits.length >= 7 && phoneDigits.length <= 15;

  if(!name||!session||!phone||!email||!className||!graduationYear){
    return res.status(400).json({ status: 'error', message: 'Vui lòng điền đầy đủ các trường bắt buộc.' });
  }
  if(!emailOk){ return res.status(400).json({ status: 'error', message: 'Email chưa hợp lệ.' }); }
  if(!phoneOk){ return res.status(400).json({ status: 'error', message: 'Số điện thoại chưa hợp lệ.' }); }

  const record = {
    name, session, phone, email, className, graduationYear, message,
    timestamp: new Date().toISOString(),
    ip: ipFrom(req),
    meta: {
      ip: ipFrom(req),
      userAgent: sanitize(req.headers['user-agent']||'', 200),
      referer: sanitize(req.headers['referer']||'', 200)
    }
  };

  const filePath = path.join(dataDir, 'registrations.json');
  let registrations = [];
  if (fs.existsSync(filePath)) {
    try { registrations = JSON.parse(fs.readFileSync(filePath)); } catch(_) { registrations = []; }
  }
  registrations.push(record);
  fs.writeFileSync(filePath, JSON.stringify(registrations, null, 2));

  res.json({ status: 'success' });
});

// Admin UI page (table + export) - protected
app.get('/admin/registrations', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// JSON data endpoint - also protected
app.get('/registrations', basicAuth, (req, res) => {
  const filePath = path.join(dataDir, 'registrations.json');
  if (!fs.existsSync(filePath)) return res.json([]);
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));