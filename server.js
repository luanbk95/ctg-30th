// Execute on: your deployment server (file path: server.js)
const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://ctg.tekonologia.com'

// Security hardening
app.use(helmet());
app.disable('x-powered-by');
app.set('trust proxy', true);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// Data dirs
const dataDir = path.join(__dirname, 'data');
const qrDir = path.join(dataDir, 'qr');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

// Rate limit cho submit
const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/submit', limiter);

// Basic Auth (dùng cho /admin và /lookup)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'phamhuuhiep@123';
function basicAuth(req, res, next){
  const hdr = req.headers.authorization || '';
  if(!hdr.startsWith('Basic ')){
    res.setHeader('WWW-Authenticate', 'Basic realm="Registrations"');
    return res.status(401).end('Authentication required');
  }
  const [user, pass] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
  if(user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Registrations"');
  return res.status(401).end('Access denied');
}

// Utils
function ipFrom(req){
  const cf = (req.headers['cf-connecting-ip'] || '').trim();
  const xr = (req.headers['x-real-ip'] || '').trim();
  const xffRaw = (req.headers['x-forwarded-for'] || '').trim();
  const xff = xffRaw ? xffRaw.split(',')[0].trim() : '';
  const direct = req.ip || req.socket?.remoteAddress || '';
  return cf || xr || xff || direct || 'unknown';
}
function sanitize(s, max=300){ if(typeof s!=='string') return ''; return s.replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,max); }
function readRegs(){
  const filePath = path.join(dataDir, 'registrations.json');
  if(!fs.existsSync(filePath)) return [];
  try{ return JSON.parse(fs.readFileSync(filePath)); }catch(_){ return []; }
}
function writeRegs(arr){
  const filePath = path.join(dataDir, 'registrations.json');
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

// Submit: lưu bản ghi + sinh ticket + QR
app.post('/submit', async (req, res) => {
  if (req.body.website) return res.status(400).json({ status: 'error', message: 'Bad request' });

  const name = sanitize(req.body.name, 120);
  const session = sanitize(req.body.session, 20);
  const phone = sanitize(req.body.phone, 32);
  const email = sanitize(req.body.email, 120);
  const className = sanitize(req.body.className || req.body.class, 40);
  const graduationYear = sanitize(req.body.graduationYear, 20);
  const message = sanitize(req.body.message, 1000);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOk = (phone.replace(/[^0-9]/g,'').length >= 7);

  if(!name||!session||!phone||!email||!className||!graduationYear){
    return res.status(400).json({ status: 'error', message: 'Vui lòng điền đầy đủ các trường bắt buộc.' });
  }
  if(!emailOk){ return res.status(400).json({ status: 'error', message: 'Email chưa hợp lệ.' }); }
  if(!phoneOk){ return res.status(400).json({ status: 'error', message: 'Số điện thoại chưa hợp lệ.' }); }

  // limit buổi sáng
  const regs = readRegs();
  if (session === 'Sáng'){
    const morning = regs.filter(r => r.session === 'Sáng').length;
    if (morning >= 400) return res.status(409).json({ status: 'full', message: 'Buổi sáng đã đủ 400 chỗ. Vui lòng chọn Buổi chiều.' });
  }

  // record
  const ticketId = crypto.randomUUID();
  const record = {
    ticketId, name, session, phone, email, className, graduationYear, message,
    timestamp: new Date().toISOString(),
    meta: { ip: ipFrom(req), userAgent: sanitize(req.headers['user-agent']||'', 200), referer: sanitize(req.headers['referer']||'', 200) },
    checked_in_at: null
  };
  regs.push(record);
  writeRegs(regs);

  // create absolute ticket URL for QR
  const origin = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const ticketUrl = `${origin}/ticket/${ticketId}`;
  const qrPath = path.join(qrDir, `${ticketId}.png`);
  try {
    // IMPORTANT: encode the absolute URL so Google Lens opens it directly
    await QRCode.toFile(qrPath, ticketUrl, { type: 'png', margin: 1, scale: 6 });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'Không tạo được mã QR.' });
  }

  return res.json({
    status: 'success',
    ticketId,
    qrUrl: `/qr/${ticketId}.png`,
    ticketUrl
  });
});

// serve QR image
app.get('/qr/:id.png', (req, res) => {
  const p = path.join(qrDir, `${req.params.id}.png`);
  if (!fs.existsSync(p)) return res.status(404).end('Not found');
  res.sendFile(p);
});

// public ticket page
app.get('/ticket/:id', (req, res) => {
  const regs = readRegs();
  const rec = regs.find(r => r.ticketId === req.params.id);
  if(!rec) return res.status(404).end('Vé không tồn tại');

  // show minimal info; avoid PII like phone/email
  const html = `<!DOCTYPE html>
  <html lang="vi"><head>
    <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Vé tham dự • ${rec.name}</title>
    <link rel="stylesheet" href="/css/style.css"/>
    <style>
      .ticket-wrap{max-width:520px;margin:24px auto;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.06);text-align:center}
      .ticket-wrap h1{font-size:1.3rem;color:#0a3c5a;margin-bottom:6px}
      .muted{color:#777}
      .qr-img{width:260px;height:260px;margin:14px auto;display:block}
      .meta{margin-top:8px;font-size:.95rem}
    </style>
  </head><body>
    <div class="ticket-wrap">
      <h1>Vé tham dự</h1>
      <div class="muted">Trường THPT Chuyên Tiền Giang</div>
      <img class="qr-img" src="/qr/${rec.ticketId}.png" alt="QR ticket"/>
      <div class="meta"><strong>${rec.name}</strong> — ${rec.session}</div>
      <div class="meta">Niên khóa: ${rec.graduationYear} • Lớp: ${rec.className}</div>
      <div class="meta">Mã vé: <code>${rec.ticketId}</code></div>
    </div>
  </body></html>`;
  res.type('html').send(html);
});

// Tra cứu cho nhân sự lúc check-in (bảo vệ Basic Auth)
app.get('/lookup', basicAuth, (req, res) => {
  const ticketId = (req.query.ticket||'').toString();
  if(!ticketId) return res.status(400).json({error:'missing ticket'});
  const regs = readRegs();
  const rec = regs.find(r => r.ticketId === ticketId);
  if(!rec) return res.status(404).json({error:'not found'});
  return res.json({
    ticketId: rec.ticketId,
    name: rec.name,
    session: rec.session,
    className: rec.className,
    graduationYear: rec.graduationYear,
    registered_at: rec.timestamp,
    checked_in_at: rec.checked_in_at
  });
});

// Thống kê công khai (không lộ PII)
app.get('/stats', (req, res) => {
  const regs = readRegs();
  const morning = regs.filter(r => r.session === 'Sáng').length;
  const afternoon = regs.filter(r => r.session === 'Chiều').length;
  res.json({ morning, afternoon, capacityMorning: 400 });
});

// Admin UI & JSON (đã có sẵn)
app.get('/admin/registrations', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/registrations', basicAuth, (req, res) => {
  const filePath = path.join(dataDir, 'registrations.json');
  if (!fs.existsSync(filePath)) return res.json([]);
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));