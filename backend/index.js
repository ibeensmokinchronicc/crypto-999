const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// ENV
const CB_KEY = process.env.COINBASE_API_KEY;
const CB_PRIVATE = process.env.COINBASE_PRIVATE_KEY;
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
    XRP: 1 / rates.XRP
  };
}

// ===== GEMINI BALANCES =====
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

    return data.map(c => ({
      currency: c.currency.toUpperCase(),
      amount: parseFloat(c.amount),
      platform: "gemini"
    }));

  } catch {
    return [];
  }
}

// ===== COINBASE BALANCES (SAFE FALLBACK) =====
async function getCoinbaseBalances() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/accounts", {
      headers: {
        Authorization: `Bearer ${CB_KEY}`
      }
    });

    const d = await res.json();

    return d.data.map(acc => ({
      currency: acc.balance.currency,
      amount: parseFloat(acc.balance.amount),
      platform: "coinbase"
    }));

  } catch {
    return [];
  }
}

// ===== SYNC =====
app.get("/sync", async (req, res) => {
  try {
    const prices = await getPrices();

    const gemini = await getGeminiBalances();
    const coinbase = await getCoinbaseBalances();

    const balances = [...gemini, ...coinbase]
      .filter(c => c.amount > 0)
      .map(c => ({
        ...c,
        usdValue: c.amount * (prices[c.currency] || 0)
      }));

    res.json({ balances, prices });

  } catch (err) {
    res.status(500).json({ error: "SYNC FAILED" });
  }
});

app.listen(3000, () => console.log("Server running"));
