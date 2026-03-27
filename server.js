const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== In-Memory Store =====
let trades = [];

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

// ===== API =====

// Stats (overlay polls this)
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

// Add trade
app.post('/api/trades', (req, res) => {
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

// Delete trade
app.delete('/api/trades/:id', (req, res) => {
  trades = trades.filter(t => String(t.id) !== req.params.id);
  res.json({ ok: true });
});

// Undo last today
app.post('/api/undo', (req, res) => {
  const today = todayStr();
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].ts.slice(0, 10) === today) {
      trades.splice(i, 1);
      break;
    }
  }
  res.json({ ok: true });
});

// Reset today
app.post('/api/reset-today', (req, res) => {
  trades = trades.filter(t => t.ts.slice(0, 10) !== todayStr());
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Trade Overlay läuft auf Port ${PORT}`);
});
