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

// ===== DB =====
const db = new Low(new JSONFile("db.json"), {
  trades: [],
  history: [],
  rewards: [],
  alerts: [],
  staking: []
});

await db.read();

// ===== ENV =====
const CB_KEY = process.env.COINBASE_API_KEY;
const GEM_KEY = process.env.GEMINI_API_KEY;
const GEM_SECRET = process.env.GEMINI_API_SECRET;

// ===== PRICES =====
async function getPrices() {
  const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD");
  const d = await r.json();
  const rates = d.data.rates;

  return {
    BTC: 1 / rates.BTC,
    ETH: 1 / rates.ETH,
    XRP: 1 / rates.XRP,
    SOL: 1 / rates.SOL || 0,
    ADA: 1 / rates.ADA || 0
  };
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

  // XRP rewards logic (monthly reset)
  const rewards = balances
    .filter(b => b.currency === "XRP" && b.platform === "gemini")
    .map(b => ({
      amount: b.amount,
      month: new Date().getMonth()
    }));

  res.json({
    balances,
    prices,
    trades: db.data.trades,
    history: db.data.history,
    rewards,
    alerts: db.data.alerts,
    staking: db.data.staking
  });
});

// ===== SAVE TRADE =====
app.post("/trade", async (req, res) => {
  db.data.trades.push(req.body);
  await db.write();
  res.json({ ok: true });
});

// ===== STAKING =====
app.post("/stake", async (req, res) => {
  db.data.staking.push(req.body);
  await db.write();
  res.json({ ok: true });
});

// ===== ALERTS =====
app.post("/alert", async (req, res) => {
  db.data.alerts.push(req.body);
  await db.write();
  res.json({ ok: true });
});

// ===== SERVE FRONTEND =====
app.use(express.static("."));

app.listen(PORT, () => {
  console.log("💀 FINAL BOSS SYSTEM RUNNING");
});
