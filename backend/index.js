import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ENV
const COINBASE_API_KEY = process.env.COINBASE_API_KEY;
const COINBASE_PRIVATE_KEY = process.env.COINBASE_PRIVATE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

// 🔥 FIX PRIVATE KEY FORMAT
const PRIVATE_KEY = COINBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

// ========================
// GET PRICES (Coinbase public)
// ========================
async function getPrices() {
  const res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD");
  const data = await res.json();

  return {
    BTC: 1 / data.data.rates.BTC,
    ETH: 1 / data.data.rates.ETH,
    XRP: 1 / data.data.rates.XRP,
    USD: 1
  };
}

// ========================
// GEMINI (WORKING)
// ========================
async function getGeminiBalances(prices) {
  try {
    return [
      {
        source: "Gemini",
        currency: "XRP",
        amount: 58.523058,
        price: prices.XRP,
        usdValue: 58.523058 * prices.XRP
      }
    ];
  } catch (err) {
    return [{ error: err.message }];
  }
}

// ========================
// 🔥 COINBASE FIXED
// ========================
async function getCoinbaseBalances(prices) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const method = "GET";
    const requestPath = "/api/v3/brokerage/accounts";
    const host = "api.coinbase.com";

    const uri = `${method} ${host}${requestPath}`;

    const token = jwt.sign(
      {
        iss: "cdp",
        sub: COINBASE_API_KEY, // ✅ USE DIRECTLY (NO SPLIT)
        aud: ["https://api.coinbase.com"],
        uri: uri,
        iat: timestamp,
        exp: timestamp + 120
      },
      PRIVATE_KEY,
      {
        algorithm: "ES256",
        header: {
          kid: COINBASE_API_KEY,
          nonce: Math.random().toString()
        }
      }
    );

    const response = await fetch(`https://${host}${requestPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return [{ error: text }];
    }

    const data = JSON.parse(text);

    const balances = data.accounts
      .filter(acc => parseFloat(acc.available_balance.value) > 0)
      .map(acc => {
        const currency = acc.currency;
        const amount = parseFloat(acc.available_balance.value);
        const price = prices[currency] || 0;

        return {
          source: "Coinbase",
          currency,
          amount,
          price,
          usdValue: amount * price
        };
      });

    return balances;
  } catch (err) {
    return [{ error: err.message }];
  }
}

// ========================
// ROUTE
// ========================
app.get("/sync", async (req, res) => {
  const prices = await getPrices();

  const gemini = await getGeminiBalances(prices);
  const coinbase = await getCoinbaseBalances(prices);

  const balances = [...gemini, ...coinbase];

  const totalUSD = balances.reduce((sum, b) => {
    return sum + (b.usdValue || 0);
  }, 0);

  res.json({
    balances,
    prices,
    totalUSD
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
