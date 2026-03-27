const express = require('express');
const path = require('path');
const { Redis } = require('@upstash/redis');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.ADMIN_PIN || 'max2024';

// ===== Redis Persistence =====
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log('Redis connected — trades will be persisted.');
} else {
  console.log('No Redis config found — trades stored in memory only.');
}

const TRADES_KEY = 'trades';
const SETTINGS_KEY = 'settings';

async function loadData() {
  if (!redis) return;
  try {
    const savedTrades = await redis.get(TRADES_KEY);
    if (savedTrades) {
      trades = typeof savedTrades === 'string' ? JSON.parse(savedTrades) : savedTrades;
      console.log(`Loaded ${trades.length} trades from Redis.`);
    }
    const savedSettings = await redis.get(SETTINGS_KEY);
    if (savedSettings) {
      const s = typeof savedSettings === 'string' ? JSON.parse(savedSettings) : savedSettings;
      Object.assign(settings, s);
      console.log('Loaded settings from Redis.');
    }
  } catch (e) {
    console.error('Redis load error:', e.message);
  }
}

async function saveTrades() {
  if (!redis) return;
  try { await redis.set(TRADES_KEY, JSON.stringify(trades)); }
  catch (e) { console.error('Redis save error:', e.message); }
}

async function saveSettings() {
  if (!redis) return;
  try { await redis.set(SETTINGS_KEY, JSON.stringify(settings)); }
  catch (e) { console.error('Redis save error:', e.message); }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== In-Memory Store (loaded from Redis on start) =====
let trades = [];
let settings = {
  bgColor: '#000000',
  barColor: 'rgba(18,18,24,0.92)',
  winColor: '#4ade80',
  lossColor: '#f87171',
  textColor: '#e0e0e0',
  fontSize: 'normal'
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

  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const weekDays = [];
  for (let i = 0; i < 5; i++) {
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
app.post('/api/settings', requirePin, async (req, res) => {
  const allowed = ['bgColor', 'barColor', 'winColor', 'lossColor', 'textColor', 'fontSize'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  await saveSettings();
  res.json(settings);
});

// Add trade (PIN required)
app.post('/api/trades', requirePin, async (req, res) => {
  const { percent, note } = req.body;
  if (percent === undefined) return res.status(400).json({ error: 'percent required' });
  const trade = {
    id: Date.now() + Math.random(),
    pct: parseFloat(percent),
    note: note || '',
    ts: new Date().toISOString()
  };
  trades.push(trade);
  await saveTrades();
  res.json(trade);
});

// Delete trade (PIN required)
app.delete('/api/trades/:id', requirePin, async (req, res) => {
  trades = trades.filter(t => String(t.id) !== req.params.id);
  await saveTrades();
  res.json({ ok: true });
});

// Undo last today (PIN required)
app.post('/api/undo', requirePin, async (req, res) => {
  const today = todayStr();
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].ts.slice(0, 10) === today) {
      trades.splice(i, 1);
      break;
    }
  }
  await saveTrades();
  res.json({ ok: true });
});

// Reset today (PIN required)
app.post('/api/reset-today', requirePin, async (req, res) => {
  trades = trades.filter(t => t.ts.slice(0, 10) !== todayStr());
  await saveTrades();
  res.json({ ok: true });
});

// Load data from Redis, then start server
loadData().then(() => {
  app.listen(PORT, () => {
    console.log(`Trade Overlay running on port ${PORT}`);
  });
});
