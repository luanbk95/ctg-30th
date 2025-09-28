const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://30years.chuyentiengiang.com';

// ===== Security & basics =====
app.use(helmet());
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(express.static(path.join(__dirname, 'public')));

// ===== Data dirs =====
const dataDir = path.join(__dirname, 'data');
const qrDir = path.join(dataDir, 'qr');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

// ===== Rate limit for submit =====
const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/submit', limiter);

// ===== Basic Auth (for /admin & /lookup) =====
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

// ===== Utils =====
function ipFrom(req){
  const cf = (req.headers['cf-connecting-ip'] || '').trim();
  const xr = (req.headers['x-real-ip'] || '').trim();
  const xffRaw = (req.headers['x-forwarded-for'] || '').trim();
  const xff = xffRaw ? xffRaw.split(',')[0].trim() : '';
  const direct = req.ip || req.socket?.remoteAddress || '';
  return cf || xr || xff || direct || 'unknown';
}
function sanitize(s, max=300){
  if(typeof s!=='string') return '';
  return s.replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,max);
}
function readRegs(){
  const filePath = path.join(dataDir, 'registrations.json');
  if(!fs.existsSync(filePath)) return [];
  try{ return JSON.parse(fs.readFileSync(filePath, 'utf8')); }catch(_){ return []; }
}
function writeRegs(arr){
  const filePath = path.join(dataDir, 'registrations.json');
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

// ===== Submit: save record + generate ticket + QR =====
app.post('/submit', async (req, res) => {
  // Honeypot
  if ((req.body.hpToken || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'Bad request' });
  }

  // Fields
  const name = sanitize(req.body.name, 120);
  const phone = sanitize(req.body.phone, 32);
  const email = sanitize(req.body.email, 120);
  const className = sanitize(req.body.className || req.body.class, 60);
  const graduationYear = sanitize(req.body.graduationYear, 20);
  const message = sanitize(req.body.message, 1000);

  // sessions expected as array ['ceremony','festival','sports']
  let sessions = req.body.sessions;
  if (typeof sessions === 'string') sessions = [sessions];
  if (!Array.isArray(sessions)) sessions = [];
  sessions = sessions.filter(v => ['ceremony','festival','sports'].includes(String(v)));

  // Validate
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOk = (phone.replace(/[^0-9]/g,'').length >= 7);
  if(!name||!phone||!email||!className||!graduationYear){
    return res.status(400).json({ status: 'error', message: 'Vui lòng điền đầy đủ các trường bắt buộc.' });
  }
  if(!emailOk){ return res.status(400).json({ status: 'error', message: 'Email chưa hợp lệ.' }); }
  if(!phoneOk){ return res.status(400).json({ status: 'error', message: 'Số điện thoại chưa hợp lệ.' }); }
  if(!sessions.length){
    return res.status(400).json({ status: 'error', message: 'Vui lòng chọn ít nhất một mục trong "Tham gia".' });
  }

  const regs = readRegs();

  // Limit ceremony (limit sáng Thứ 7) to 200
  if (sessions.includes('ceremony')){
    const ceremonyCount = regs.reduce((acc, r) => acc + (Array.isArray(r.sessions) && r.sessions.includes('ceremony') ? 1 : 0), 0);
    if (ceremonyCount >= 200){
      return res.status(409).json({ status: 'full', message: 'Phần Lễ (sáng Thứ 7) đã đủ 200 chỗ.' });
    }
  }

  // Record
  const ticketId = crypto.randomUUID();
  const record = {
    ticketId,
    name,
    phone,
    email,
    className,
    graduationYear,
    message,
    sessions, // array
    timestamp: new Date().toISOString(),
    meta: {
      ip: ipFrom(req),
      userAgent: sanitize(req.headers['user-agent']||'', 200),
      referer: sanitize(req.headers['referer']||'', 200)
    },
    checked_in_at: null
  };
  regs.push(record);
  writeRegs(regs);

  // Create absolute ticket URL for QR
  const origin = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const ticketUrl = `${origin}/ticket/${ticketId}`;
  const qrPath = path.join(qrDir, `${ticketId}.png`);
  try {
    // Encode absolute URL for direct open in Google Lens / Zalo
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

// ===== Serve QR image =====
app.get('/qr/:id.png', (req, res) => {
  const p = path.join(qrDir, `${req.params.id}.png`);
  if (!fs.existsSync(p)) return res.status(404).end('Not found');
  res.sendFile(p);
});

// ===== Public ticket page =====
app.get('/ticket/:id', (req, res) => {
  const regs = readRegs();
  const rec = regs.find(r => r.ticketId === req.params.id);
  if(!rec) return res.status(404).end('Vé không tồn tại');

  const sessionMap = {
    ceremony: 'Phần Lễ (sáng Thứ 7)',
    festival: 'Phần Hội (chiều tối Thứ 7)',
    sports:   'Giao lưu thể thao (sáng Chủ Nhật)'
  };
  const sessionList = Array.isArray(rec.sessions) && rec.sessions.length
    ? rec.sessions.map(s => sessionMap[s] || s).join(' • ')
    : '—';

  const html = `<!DOCTYPE html>
  <html lang="vi"><head>
    <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="robots" content="noindex,nofollow"/>
    <title>Vé tham dự • ${rec.name}</title>
    <link rel="stylesheet" href="/css/style.css"/>
    <style>
      .ticket-wrap{max-width:560px;margin:24px auto;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.06);text-align:center}
      .ticket-wrap h1{font-size:1.35rem;color:#0a3c5a;margin-bottom:6px}
      .muted{color:#777}
      .qr-img{width:260px;height:260px;margin:14px auto;display:block}
      .meta{margin-top:8px;font-size:.95rem}
      code{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
    </style>
  </head><body>
    <div class="ticket-wrap">
      <h1>Vé tham dự</h1>
      <div class="muted">Trường THPT Chuyên Tiền Giang</div>
      <img class="qr-img" src="/qr/${rec.ticketId}.png" alt="QR ticket"/>
      <div class="meta"><strong>${rec.name}</strong></div>
      <div class="meta">Tham gia: ${sessionList}</div>
      <div class="meta">Niên khóa: ${rec.graduationYear} • Lớp: ${rec.className}</div>
      <div class="meta">Mã vé: <code>${rec.ticketId}</code></div>
    </div>
  </body></html>`;
  res.type('html').send(html);
});

// ===== Lookup for staff (Basic Auth) =====
app.get('/lookup', basicAuth, (req, res) => {
  const ticketId = (req.query.ticket||'').toString();
  if(!ticketId) return res.status(400).json({error:'missing ticket'});
  const regs = readRegs();
  const rec = regs.find(r => r.ticketId === ticketId);
  if(!rec) return res.status(404).json({error:'not found'});
  return res.json({
    ticketId: rec.ticketId,
    name: rec.name,
    sessions: rec.sessions || [],
    className: rec.className,
    graduationYear: rec.graduationYear,
    registered_at: rec.timestamp,
    checked_in_at: rec.checked_in_at
  });
});

// ===== Public stats (no PII) — 3 counters + capacity for ceremony =====
app.get('/stats', (req, res) => {
  const regs = readRegs();
  const ceremony = regs.reduce((acc, r) => acc + (Array.isArray(r.sessions) && r.sessions.includes('ceremony') ? 1 : 0), 0);
  const festival = regs.reduce((acc, r) => acc + (Array.isArray(r.sessions) && r.sessions.includes('festival') ? 1 : 0), 0);
  const sports   = regs.reduce((acc, r) => acc + (Array.isArray(r.sessions) && r.sessions.includes('sports')   ? 1 : 0), 0);
  res.json({ ceremony, festival, sports, capacityCeremony: 200 });
});

// ===== Admin UI & data =====
app.get('/admin/registrations', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/registrations', basicAuth, (req, res) => {
  const filePath = path.join(dataDir, 'registrations.json');
  if (!fs.existsSync(filePath)) return res.json([]);
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
