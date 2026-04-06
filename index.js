import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import crypto from "crypto";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const db = new Low(new JSONFile("db.json"), {
  trades: [],
  history: [],
  alerts: [],
  staking: [],
  rewards: []
});

await db.read();

const CB_KEY = process.env.COINBASE_API_KEY;
const GEM_KEY = process.env.GEMINI_API_KEY;
const GEM_SECRET = process.env.GEMINI_API_SECRET;

// ===== PRICE ENGINE =====
async function getPrices() {
  const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD");
  const d = await r.json();
  const rates = d.data.rates;

  const map = {};
  Object.keys(rates).forEach(c => {
    map[c] = 1 / rates[c];
  });

  return map;
}

// ===== GEMINI =====
async function getGeminiBalances() {
  try {
    const payload = {
      request: "/v1/balances",
      nonce: Date.now()
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");

    const signature = crypto
      .createHmac("sha384", GEM_SECRET)
      .update(encoded)
      .digest("hex");

    const res = await fetch("https://api.gemini.com/v1/balances", {
      method: "POST",
      headers: {
        "X-GEMINI-APIKEY": GEM_KEY,
        "X-GEMINI-PAYLOAD": encoded,
        "X-GEMINI-SIGNATURE": signature
      }
    });

    const data = await res.json();

    return data
      .filter(c => parseFloat(c.amount) > 0)
      .map(c => ({
        currency: c.currency.toUpperCase(),
        amount: parseFloat(c.amount),
        platform: "gemini"
      }));

  } catch {
    return [];
  }
}

// ===== COINBASE =====
async function getCoinbaseBalances() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/accounts", {
      headers: { Authorization: `Bearer ${CB_KEY}` }
    });

    const d = await res.json();

    return d.data
      .filter(a => parseFloat(a.balance.amount) > 0)
      .map(a => ({
        currency: a.balance.currency,
        amount: parseFloat(a.balance.amount),
        platform: "coinbase"
      }));

  } catch {
    return [];
  }
}

// ===== SYNC =====
app.get("/sync", async (req, res) => {
  const prices = await getPrices();

  const gemini = await getGeminiBalances();
  const coinbase = await getCoinbaseBalances();

  const balances = [...gemini, ...coinbase].map(b => ({
    ...b,
    usdValue: b.amount * (prices[b.currency] || 0)
  }));

  res.json({
    balances,
    prices,
    trades: db.data.trades,
    history: db.data.history,
    alerts: db.data.alerts,
    staking: db.data.staking,
    rewards: db.data.rewards
  });
});

// ===== SAVE ROUTES =====
app.post("/trade", async (req, res) => {
  db.data.trades.push(req.body);
  await db.write();
  res.json({ ok: true });
});

app.post("/alert", async (req, res) => {
  db.data.alerts.push(req.body);
  await db.write();
  res.json({ ok: true });
});

app.post("/stake", async (req, res) => {
  db.data.staking.push(req.body);
  await db.write();
  res.json({ ok: true });
});

app.post("/reward", async (req, res) => {
  db.data.rewards.push(req.body);
  await db.write();
  res.json({ ok: true });
});

// ===== STATIC FILES =====
app.use(express.static("."));

// ✅ FIX: FORCE LOAD INDEX.HTML
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});

// ===== START SERVER =====
app.listen(PORT, () => console.log("💀 ULTRA SYSTEM LIVE"));
