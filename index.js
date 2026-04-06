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
  alerts: [],
  staking: [],
  rewards: []
});

await db.read();

// PRICE ENGINE
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

// GEMINI FULL DATA (BALANCES + TRANSACTIONS)
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

    // TRANSACTIONS (for rewards)
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

// COINBASE
async function getCoinbaseBalances() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/accounts", {
      headers: { Authorization: `Bearer ${process.env.COINBASE_API_KEY}` }
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

// SYNC (LOCKED)
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
    res.json({ balances: [], prices: {}, transactions: [] });
  }
});

app.use(express.static("."));

app.listen(PORT, () => console.log("💀 SYSTEM LOCKED"));
