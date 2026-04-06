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
  if (key.includes("-----BEGIN") && key.includes("\n")) return key;
  return key.replace(/\\n/g, "\n");
}

/* =========================
   ENV VARIABLES
========================= */
const COINBASE_API_KEY = process.env.COINBASE_API_KEY;
const COINBASE_PRIVATE_KEY = formatPrivateKey(process.env.COINBASE_PRIVATE_KEY);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

/* =========================
   GEMINI FETCH
========================= */
async function getGeminiBalances() {
  try {
    const url = "https://api.gemini.com/v1/balances";

    const payload = {
      request: "/v1/balances",
      nonce: Date.now().toString()
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");

    const signature = crypto
      .createHmac("sha384", GEMINI_API_SECRET)
      .update(payloadBase64)
      .digest("hex");

    const res = await fetch(url, {
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
        currency: c.currency,
        amount: c.amount
      }));

  } catch (err) {
    return { error: err.message };
  }
}

/* =========================
   COINBASE FETCH (ECDSA)
========================= */
async function getCoinbaseAccounts() {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const requestPath = "/api/v3/brokerage/accounts";

    const message = timestamp + method + requestPath;

    const sign = crypto.createSign("SHA256");
    sign.update(message);
    sign.end();

    const signature = sign.sign(COINBASE_PRIVATE_KEY, "base64");

    const res = await fetch("https://api.coinbase.com" + requestPath, {
      method: method,
      headers: {
        "CB-ACCESS-KEY": COINBASE_API_KEY,
        "CB-ACCESS-SIGN": signature,
        "CB-ACCESS-TIMESTAMP": timestamp,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!data.accounts) return { error: data };

    return data.accounts
      .filter(acc => parseFloat(acc.available_balance?.value || 0) > 0)
      .map(acc => ({
        currency: acc.currency,
        amount: acc.available_balance.value
      }));

  } catch (err) {
    return { error: err.message };
  }
}

/* =========================
   PRICE FETCH
========================= */
async function getPrices() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd"
  );
  return res.json();
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

    res.json({
      gemini,
      coinbase,
      prices
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
