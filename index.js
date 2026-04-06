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

// =====================
// 💾 DATABASE
// =====================
const db = new Low(new JSONFile("db.json"), {
  trades: [],
  alerts: [],
  staking: [],
  rewards: []
});

await db.read();
db.data ||= { trades: [], alerts: [], staking: [], rewards: [] };

// =====================
// 💲 PRICE ENGINE
// =====================
async function getPrices() {
  try {
    const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD");
    const d = await r.json();
    const rates = d.data.rates;

    const map = {};
    Object.keys(rates).forEach(c => {
      map[c] = 1 / rates[c];
    });

    return map;

  } catch {
    return {};
  }
}

// =====================
// 💎 GEMINI (BALANCES + TRANSACTIONS)
// =====================
async function getGeminiData() {
  try {
    const payload = {
      request: "/v1/balances",
      nonce: Date.now()
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");

    const signature = crypto
      .createHmac("sha384", process.env.GEMINI_API_SECRET)
      .update(encoded)
      .digest("hex");

    const balancesRes = await fetch("https://api.gemini.com/v1/balances", {
      method: "POST",
      headers: {
        "X-GEMINI-APIKEY": process.env.GEMINI_API_KEY,
        "X-GEMINI-PAYLOAD": encoded,
        "X-GEMINI-SIGNATURE": signature
      }
    });

    const balancesRaw = await balancesRes.json();

    const balances = balancesRaw
      .filter(c => parseFloat(c.amount) > 0)
      .map(c => ({
        currency: c.currency.toUpperCase(),
        amount: parseFloat(c.amount),
        platform: "gemini"
      }));

    // TRANSACTIONS
    const txPayload = {
      request: "/v1/mytrades",
      nonce: Date.now()
    };

    const txEncoded = Buffer.from(JSON.stringify(txPayload)).toString("base64");

    const txSig = crypto
      .createHmac("sha384", process.env.GEMINI_API_SECRET)
      .update(txEncoded)
      .digest("hex");

    const txRes = await fetch("https://api.gemini.com/v1/mytrades", {
      method: "POST",
      headers: {
        "X-GEMINI-APIKEY": process.env.GEMINI_API_KEY,
        "X-GEMINI-PAYLOAD": txEncoded,
        "X-GEMINI-SIGNATURE": txSig
      }
    });

    const txRaw = await txRes.json();

    const transactions = txRaw.map(tx => ({
      currency: tx.symbol?.replace("usd", "").toUpperCase(),
      amount: tx.amount,
      type: "Credit",
      timestamp: tx.timestampms
    }));

    return { balances, transactions };

  } catch {
    return { balances: [], transactions: [] };
  }
}

// =====================
// 🪙 COINBASE
// =====================
async function getCoinbaseBalances() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/accounts", {
      headers: {
        Authorization: `Bearer ${process.env.COINBASE_API_KEY}`
      }
    });

    const d = await res.json();

    return d.data.map(a => ({
      currency: a.balance.currency,
      amount: parseFloat(a.balance.amount),
      platform: "coinbase"
    }));

  } catch {
    return [];
  }
}

// =====================
// 🔄 SYNC (MAIN ENGINE)
// =====================
app.get("/sync", async (req, res) => {
  try {
    const prices = await getPrices();

    const { balances: gemini, transactions } = await getGeminiData();
    const coinbase = await getCoinbaseBalances();

    const balances = [...gemini, ...coinbase].map(b => ({
      ...b,
      usdValue: b.amount * (prices[b.currency] || 0)
    }));

    res.json({
      balances,
      prices,
      transactions,
      trades: db.data.trades,
      alerts: db.data.alerts,
      staking: db.data.staking,
      rewards: db.data.rewards
    });

  } catch {
    res.json({
      balances: [],
      prices: {},
      transactions: [],
      trades: [],
      alerts: [],
      staking: [],
      rewards: []
    });
  }
});

// =====================
// ➕ ADD TRADE
// =====================
app.post("/trade", async (req, res) => {
  const { coin, amount, price } = req.body;

  db.data.trades.push({
    coin,
    amount,
    price,
    timestamp: Date.now()
  });

  await db.write();
  res.json({ ok: true });
});

// =====================
// 🔔 ALERTS
// =====================
app.post("/alert", async (req, res) => {
  const { coin, price } = req.body;

  db.data.alerts.push({
    coin,
    price,
    created: Date.now()
  });

  await db.write();
  res.json({ ok: true });
});

// =====================
// 🏦 STAKING
// =====================
app.post("/stake", async (req, res) => {
  const { coin, amount } = req.body;

  db.data.staking.push({
    coin,
    amount,
    timestamp: Date.now()
  });

  await db.write();
  res.json({ ok: true });
});

// =====================
// 💎 MANUAL REWARDS
// =====================
app.post("/reward", async (req, res) => {
  const { coin, amount } = req.body;

  db.data.rewards.push({
    coin,
    amount,
    timestamp: Date.now()
  });

  await db.write();
  res.json({ ok: true });
});

// =====================
// ❤️ HEALTH CHECK
// =====================
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: Date.now() });
});

// =====================
// 🌐 STATIC
// =====================
app.use(express.static("."));

// =====================
// 🚀 START
//
