const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.ADMIN_PIN || 'max2024';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== In-Memory Store =====
let trades = [];
let settings = {
  bgColor: '#000000',
  barColor: 'rgba(18,18,24,0.92)',
  winColor: '#4ade80',
  lossColor: '#f87171',
  textColor: '#e0e0e0',
  fontSize: 'normal'  // 'small', 'normal', 'large'
};

// ===== Helpers =====
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMondayOfWeek() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const off = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + off);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// ===== PIN Auth Middleware =====
function requirePin(req, res, next) {
  const pin = req.headers['x-pin'] || req.query.pin;
  if (pin !== PIN) return res.status(401).json({ error: 'wrong pin' });
  next();
}

// ===== API =====

// Verify PIN
app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (pin === PIN) return res.json({ ok: true });
  res.status(401).json({ error: 'wrong pin' });
});

// Stats (overlay polls this - no PIN needed)
app.get('/api/stats', (req, res) => {
  const today = todayStr();
  const todayTrades = trades.filter(t => t.ts.slice(0, 10) === today);
  const monday = getMondayOfWeek();
  const weekTrades = trades.filter(t => new Date(t.ts) >= monday);

  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const dt = trades.filter(t => t.ts.slice(0, 10) === ds);
    weekDays.push({
      label: days[i], date: ds, count: dt.length,
      profit: +(dt.reduce((s, t) => s + t.pct, 0).toFixed(4))
    });
  }

  res.json({
    today: {
      count: todayTrades.length,
      profit: +(todayTrades.reduce((s, t) => s + t.pct, 0).toFixed(4)),
      trades: todayTrades
    },
    week: {
      count: weekTrades.length,
      profit: +(weekTrades.reduce((s, t) => s + t.pct, 0).toFixed(4)),
      days: weekDays
    }
  });
});

// Get settings (no PIN - overlay needs this)
app.get('/api/settings', (req, res) => {
  res.json(settings);
});

// Update settings (PIN required)
app.post('/api/settings', requirePin, (req, res) => {
  const allowed = ['bgColor', 'barColor', 'winColor', 'lossColor', 'textColor', 'fontSize'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  res.json(settings);
});

// Add trade (PIN required)
app.post('/api/trades', requirePin, (req, res) => {
  const { percent, note } = req.body;
  if (percent === undefined) return res.status(400).json({ error: 'percent required' });
  const trade = {
    id: Date.now() + Math.random(),
    pct: parseFloat(percent),
    note: note || '',
    ts: new Date().toISOString()
  };
  trades.push(trade);
  res.json(trade);
});

// Delete trade (PIN required)
app.delete('/api/trades/:id', requirePin, (req, res) => {
  trades = trades.filter(t => String(t.id) !== req.params.id);
  res.json({ ok: true });
});

// Undo last today (PIN required)
app.post('/api/undo', requirePin, (req, res) => {
  const today = todayStr();
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].ts.slice(0, 10) === today) {
      trades.splice(i, 1);
      break;
    }
  }
  res.json({ ok: true });
});

// Reset today (PIN required)
app.post('/api/reset-today', requirePin, (req, res) => {
  trades = trades.filter(t => t.ts.slice(0, 10) !== todayStr());
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Trade Overlay running on port ${PORT}`);
});
