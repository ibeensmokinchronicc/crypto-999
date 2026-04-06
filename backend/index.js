import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/* =========================
   FORMAT PRIVATE KEY
========================= */
function formatPrivateKey(key) {
  if (!key) return "";
  return key.includes("\\n") ? key.replace(/\\n/g, "\n").trim() : key.trim();
}

/* =========================
   ENV VARIABLES
========================= */
const COINBASE_API_KEY = process.env.COINBASE_API_KEY;
const COINBASE_PRIVATE_KEY = formatPrivateKey(process.env.COINBASE_PRIVATE_KEY);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

/* =========================
   GEMINI BALANCES
========================= */
async function getGeminiBalances() {
  try {
    const payload = {
      request: "/v1/balances",
      nonce: Date.now().toString()
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");

    const signature = crypto
      .createHmac("sha384", GEMINI_API_SECRET)
      .update(payloadBase64)
      .digest("hex");

    const res = await fetch("https://api.gemini.com/v1/balances", {
      method: "POST",
      headers: {
        "X-GEMINI-APIKEY": GEMINI_API_KEY,
        "X-GEMINI-PAYLOAD": payloadBase64,
        "X-GEMINI-SIGNATURE": signature,
        "Content-Type": "text/plain"
      }
    });

    const data = await res.json();

    return data
      .filter(c => parseFloat(c.amount) > 0)
      .map(c => ({
        source: "Gemini",
        currency: c.currency,
        amount: parseFloat(c.amount)
      }));

  } catch (err) {
    return [{ error: err.message }];
  }
}

/* =========================
   COINBASE (ED25519 FIX)
========================= */
async function getCoinbaseAccounts() {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const requestPath = "/api/v3/brokerage/accounts";

    const message = timestamp + method + requestPath;

    // ✅ ED25519 SIGNING
    const signature = crypto.sign(
      null,
      Buffer.from(message),
      COINBASE_PRIVATE_KEY
    ).toString("base64");

    const res = await fetch("https://api.coinbase.com" + requestPath, {
      method: method,
      headers: {
        "CB-ACCESS-KEY": COINBASE_API_KEY,
        "CB-ACCESS-SIGN": signature,
        "CB-ACCESS-TIMESTAMP": timestamp,
        "Content-Type": "application/json"
      }
    });

    const text = await res.text();

    if (!text.startsWith("{")) {
      return [{ error: text }];
    }

    const data = JSON.parse(text);

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

/* =========================
   COINBASE PRICES
========================= */
async function getPrices() {
  try {
    const res = await fetch(
      "https://api.coinbase.com/v2/exchange-rates?currency=USD"
    );

    const data = await res.json();
    const rates = data?.data?.rates || {};

    return {
      BTC: rates.BTC ? 1 / parseFloat(rates.BTC) : 0,
      ETH: rates.ETH ? 1 / parseFloat(rates.ETH) : 0,
      XRP: rates.XRP ? 1 / parseFloat(rates.XRP) : 0,
      USD: 1
    };

  } catch {
    return {
      BTC: 0,
      ETH: 0,
      XRP: 0,
      USD: 1
    };
  }
}

/* =========================
   ATTACH USD VALUES
========================= */
function attachUSDValues(balances, prices) {
  return balances.map(asset => {
    if (asset.error) return asset;

    const price = prices[asset.currency] || 0;

    return {
      ...asset,
      price,
      usdValue: asset.amount * price
    };
  });
}

/* =========================
   MAIN ROUTE
========================= */
app.get("/sync", async (req, res) => {
  try {
    const [gemini, coinbase, prices] = await Promise.all([
      getGeminiBalances(),
      getCoinbaseAccounts(),
      getPrices()
    ]);

    const allBalances = [...gemini, ...coinbase];

    const enriched = attachUSDValues(allBalances, prices);

    const totalUSD = enriched.reduce((sum, a) => {
      return sum + (a.usdValue || 0);
    }, 0);

    res.json({
      balances: enriched,
      prices,
      totalUSD
    });

  } catch (err) {
    res.status(500).json({
      error: "Sync failed",
      details: err.message
    });
  }
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("Crypto 999 backend running 🚀");
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
