import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
  HEALTH CHECK (optional but useful)
*/
app.get("/", (req, res) => {
  res.send("Crypto 999 backend running 🚀");
});

/*
  MAIN SYNC ROUTE
*/
app.get("/sync", async (req, res) => {
  try {
    /*
      🔹 MOCK DATA (SAFE START)
      Replace later with real API keys
    */
    const gemini = [
      { currency: "XRP", amount: "100" }
    ];

    const coinbase = [
      {
        currency: "BTC",
        available_balance: { value: "0.01" }
      }
    ];

    /*
      🔹 LIVE PRICES (CoinGecko)
    */
    const priceRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd"
    );

    if (!priceRes.ok) {
      throw new Error("Price fetch failed");
    }

    const prices = await priceRes.json();

    /*
      🔹 RESPONSE FORMAT (VERY IMPORTANT)
      Must match frontend exactly
    */
    res.json({
      gemini,
      coinbase,
      prices
    });

  } catch (error) {
    console.error("SYNC ERROR:", error.message);

    res.status(500).json({
      error: "Sync failed",
      details: error.message
    });
  }
});

/*
  START SERVER
*/
app.listen(PORT, () => {
  console.log(`🚀 Crypto 999 backend running on port ${PORT}`);
});
