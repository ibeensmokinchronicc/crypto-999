const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// ENV
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

const COINBASE_API_KEY = process.env.COINBASE_API_KEY;

let COINBASE_PRIVATE_KEY = process.env.COINBASE_PRIVATE_KEY;

// Fix \n formatting if needed
if (COINBASE_PRIVATE_KEY && COINBASE_PRIVATE_KEY.includes("\\n")) {
  COINBASE_PRIVATE_KEY = COINBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
}

// ---------------- GEMINI ----------------
async function getGeminiBalances() {
  try {
    const payload = {
      request: "/v1/balances",
      nonce: Date.now().toString()
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");

    const signature = crypto
      .createHmac("sha384", GEMINI_API_SECRET)
      .update(encoded)
      .digest("hex");

    const res = await fetch("https://api.gemini.com/v1/balances", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-GEMINI-APIKEY": GEMINI_API_KEY,
        "X-GEMINI-PAYLOAD": encoded,
        "X-GEMINI-SIGNATURE": signature
      }
    });

    const data = await res.json();

    return data
      .filter(asset => parseFloat(asset.amount) > 0)
      .map(asset => ({
        source: "Gemini",
        currency: asset.currency.toUpperCase(),
        amount: parseFloat(asset.amount)
      }));

  } catch (err) {
    return [{ error: err.message }];
  }
}

// ---------------- COINBASE ----------------
async function getCoinbaseAccounts() {
  try {
    // ✅ CORRECT URI (THIS FIXES UNAUTHORIZED)
    const uri = "GET /api/v3/brokerage/accounts";

    // ✅ FIX EC KEY PARSING
    const PRIVATE_KEY_OBJ = crypto.createPrivateKey({
      key: COINBASE_PRIVATE_KEY,
      format: "pem"
    });

    const token = jwt.sign(
      {
        iss: "cdp",
        sub: COINBASE_API_KEY,
        aud: ["https://api.coinbase.com"],
        uri: uri
      },
      PRIVATE_KEY_OBJ,
      {
        algorithm: "ES256",
        expiresIn: "120s"
      }
    );

    const res = await fetch("https://api.coinbase.com/api/v3/brokerage/accounts", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    const text = await res.text();

    // Handle non-JSON responses safely
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return [{ error: text }];
    }

    if (!data.accounts) return [{ error: data }];

    return data.accounts
      .filter(acc => parseFloat(acc.available_balance?.value || 0) > 0)
      .map(acc => ({
        source: "Coinbase",
        currency: acc.currency,
        amount: parseFloat(acc.available_balance.value)
      }));

  } catch (err) {
    return [{ error: err.message }];
  }
}

// ---------------- PRICES ----------------
async function getPrices() {
  try {
    const coins = ["BTC", "ETH", "XRP"];
    const prices = {};

    for (let coin of coins) {
      const res = await fetch(
        `https://api.coinbase.com/v2/prices/${coin}-USD/spot`
      );
      const data = await res.json();
      prices[coin] = parseFloat(data.data.amount);
    }

    prices["USD"] = 1;

    return prices;

  } catch (err) {
    return { error: err.message };
  }
}

// ---------------- MAIN ----------------
app.get("/sync", async (req, res) => {
  const gemini = await getGeminiBalances();
  const coinbase = await getCoinbaseAccounts();
  const prices = await getPrices();

  const balances = [...gemini, ...coinbase];

  let totalUSD = 0;

  const enriched = balances.map(b => {
    if (b.error) return b;

    const price = prices[b.currency] || 0;
    const usdValue = b.amount * price;

    totalUSD += usdValue;

    return {
      ...b,
      price,
      usdValue
    };
  });

  res.json({
    balances: enriched,
    prices,
    totalUSD
  });
});

// ---------------- START ----------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
