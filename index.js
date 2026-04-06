import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// DB
const db = new Low(new JSONFile("db.json"), {
  trades: [],
  alerts: [],
  staking: [],
  rewards: []
});

await db.read();

// ENV
const GEM_KEY = process.env.GEMINI_API_KEY;
const GEM_SECRET = process.env.GEMINI_API_SECRET;

const CB_KEY = process.env.COINBASE_API_KEY;
const CB_PRIVATE_KEY = process.env.COINBASE_PRIVATE_KEY;

// =====================
// 💰 PRICE ENGINE
// =====================
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

// =====================
// 🔐 GEMINI AUTH
// =====================
function geminiHeaders(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");

  const signature = crypto
    .createHmac("sha384", GEM_SECRET)
    .update(encoded)
    .digest("hex");

  return {
    "X-GEMINI-APIKEY": GEM_KEY,
    "X-GEMINI-PAYLOAD": encoded,
    "X-GEMINI-SIGNATURE": signature
  };
}

// =====================
// 🔹 GEMINI BALANCES
// =====================
async function getGeminiBalances() {
  try {
    const payload = {
      request: "/v1/balances",
      nonce: Date.now()
    };

    const res = await fetch("https://api.gemini.com/v1/balances", {
      method: "POST",
      headers: geminiHeaders(payload)
    });

    const data = await res.json();

    return data
      .filter(c => parseFloat(c.amount) > 0)
      .map(c => ({
        currency: c.currency.toUpperCase(),
        amount: parseFloat(c.amount),
        platform: "gemini"
      }));

  } catch (e) {
    console.log("Gemini error", e);
    return [];
  }
}

// =====================
// 🔹 GEMINI TRANSACTIONS (REWARDS)
// =====================
async function getGeminiTransactions() {
  try {
    const payload = {
      request: "/v1/transfers",
      nonce: Date.now()
    };

    const res = await fetch("https://api.gemini.com/v1/transfers", {
      method: "POST",
      headers: geminiHeaders(payload)
    });

    return await res.json();

  } catch {
    return [];
  }
}

// =====================
// 🔐 COINBASE JWT (CDP API)
// =====================
function createCoinbaseJWT() {
  try {
    const privateKey = CB_PRIVATE_KEY;

    return jwt.sign(
      {
        iss: "cdp",
        nbf: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        sub: CB_KEY
      },
      privateKey,
      {
        algorithm: "ES256",
        header: {
          kid: CB_KEY,
          nonce: crypto.randomBytes(16).toString("hex")
        }
      }
    );
  } catch (e) {
    console.log("JWT ERROR:", e);
    return null;
  }
}

// =====================
// 🔹 COINBASE BALANCES
// =====================
async function getCoinbaseBalances() {
  try {
    const token = createCoinbaseJWT();
    if (!token) return [];

    const res = await fetch("https://api.coinbase.com/api/v3/brokerage/accounts", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    return (data.accounts || [])
      .filter(a => parseFloat(a.available_balance?.value || 0) > 0)
      .map(a => ({
        currency: a.currency,
        amount: parseFloat(a.available_balance.value),
        platform: "coinbase"
      }));

  } catch (e) {
    console.log("Coinbase error", e);
    return [];
  }
}

// =====================
// 🔄 SYNC
// =====================
app.get("/sync", async (req, res) => {
  try {
    const prices = await getPrices();

    const geminiBalances = await getGeminiBalances();
    const geminiTx = await getGeminiTransactions();
    const coinbaseBalances = await getCoinbaseBalances();

    const balances = [...geminiBalances, ...coinbaseBalances].map(b => ({
      ...b,
      usdValue: b.amount * (prices[b.currency] || 0)
    }));

    res.json({
      prices,
      balances,
      transactions: geminiTx,
      trades: db.data.trades,
      alerts: db.data.alerts,
      staking: db.data.staking,
      rewards: db.data.rewards
    });

  } catch (e) {
    res.json({ error: "sync failed" });
  }
});

// =====================
// 💾 SAVE ROUTES
// =====================
app.post("/trade", async (req, res) => {
  db.data.trades.push(req.body);
  await db.write();
  res.json({ ok: true });
});

app.post("/reward", async (req, res) => {
  db.data.rewards.push(req.body);
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

// =====================
// 🚀 START SERVER
// =====================
app.use(express.static("."));

app.listen(PORT, () => {
  console.log("💀 FULL SYNC LIVE");
});
