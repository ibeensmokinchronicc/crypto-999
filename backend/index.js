<!DOCTYPE html>
<html>
<head>
  <title>999 Crypto App</title>

  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#9333ea">
  <link rel="manifest" href="/manifest.json">

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <style>
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: radial-gradient(circle at top, #1a0f2e, #000000);
      color: white;
      text-align: center;
    }

    h1 {
      color: #c084fc;
      text-shadow: 0 0 20px #9333ea;
    }

    .tabs {
      position: fixed;
      bottom: 0;
      width: 100%;
      background: #0f172a;
      display: flex;
      justify-content: space-around;
      padding: 10px;
    }

    .tabs button {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
    }

    .hidden { display: none; }

    .card {
      background: rgba(30, 41, 59, 0.6);
      margin: 15px auto;
      padding: 15px;
      width: 300px;
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(147, 51, 234, 0.5);
    }

    input {
      padding: 10px;
      margin: 5px;
      border-radius: 8px;
      border: none;
      width: 110px;
    }

    button {
      padding: 10px;
      border-radius: 8px;
      border: none;
      background: #9333ea;
      color: white;
      cursor: pointer;
    }

    #total {
      color: #22c55e;
      font-size: 22px;
      margin-bottom: 80px;
    }
  </style>
</head>

<body>

<h1>999 Crypto App</h1>

<!-- PORTFOLIO -->
<div id="portfolioTab">

  <input id="coinName" placeholder="Coin">
  <input id="coinAmount" placeholder="Amount">
  <input id="coinCost" placeholder="Buy Price">
  <button onclick="addManual()">Add</button>

  <canvas id="chart"></canvas>

  <div id="portfolio"></div>

  <h2 id="total">Total: $0</h2>
  <h3 id="profitTotal"></h3>

  <h3>Alerts</h3>
  <input id="alertCoin" placeholder="BTC">
  <input id="alertPrice" placeholder="Price">
  <button onclick="addAlert()">Set</button>

</div>

<!-- REWARDS -->
<div id="rewardsTab" class="hidden">

  <h2>💳 Rewards</h2>

  <input id="gas" placeholder="Gas">
  <input id="dining" placeholder="Dining">
  <input id="groceries" placeholder="Groceries">
  <input id="other" placeholder="Other">

  <br><br>

  <button onclick="addTransaction()">Add</button>
  <button onclick="resetMonth()">Reset</button>

  <div id="alerts"></div>

  <canvas id="rewardsChart"></canvas>

  <div id="rewardsResult" class="card"></div>

</div>

<!-- NAV -->
<div class="tabs">
  <button onclick="showTab('portfolio')">Portfolio</button>
  <button onclick="showTab('rewards')">Rewards</button>
</div>

<script>

// NAV
function showTab(tab) {
  portfolioTab.classList.add("hidden");
  rewardsTab.classList.add("hidden");

  if (tab === "portfolio") portfolioTab.classList.remove("hidden");
  else rewardsTab.classList.remove("hidden");
}

// STORAGE
let coins = JSON.parse(localStorage.getItem("coins")) || [];
let alertsList = JSON.parse(localStorage.getItem("alerts")) || [];
let transactions = JSON.parse(localStorage.getItem("tx")) || [];

function save() {
  localStorage.setItem("coins", JSON.stringify(coins));
  localStorage.setItem("alerts", JSON.stringify(alertsList));
  localStorage.setItem("tx", JSON.stringify(transactions));
}

// ADD COIN
function addManual() {
  const c = coinName.value.toUpperCase();
  const a = parseFloat(coinAmount.value);
  const cost = parseFloat(coinCost.value);

  if (!c || !a || !cost) return;

  coins.push({ currency: c, amount: a, cost });
  save();
  loadData();
}

// ALERTS
function addAlert() {
  alertsList.push({
    coin: alertCoin.value.toUpperCase(),
    price: parseFloat(alertPrice.value),
    triggered: false
  });

  save();
}

function notify(msg) {
  if (Notification.permission === "granted") {
    new Notification(msg);
  }
}

Notification.requestPermission();

// LOAD DATA
let chart;

async function loadData() {
  const res = await fetch("/sync");
  const data = await res.json();

  let total = 0;
  let profitTotal = 0;

  let labels = [];
  let values = [];

  portfolio.innerHTML = "";

  data.balances.forEach(c => {
    const val = c.usdValue || 0;
    total += val;

    labels.push(c.currency);
    values.push(val);

    portfolio.innerHTML += `
      <div class="card">
        <h3>${c.currency}</h3>
        <p>$${val.toFixed(2)}</p>
      </div>
    `;
  });

  coins.forEach(c => {
    const price = data.prices[c.currency] || 0;
    const val = c.amount * price;
    const profit = val - (c.amount * c.cost);

    total += val;
    profitTotal += profit;

    labels.push(c.currency + " (M)");
    values.push(val);

    portfolio.innerHTML += `
      <div class="card">
        <h3>${c.currency}</h3>
        <p>$${val.toFixed(2)}</p>
        <p style="color:${profit>=0?'#22c55e':'#ef4444'}">
          ${profit>=0?'+':''}$${profit.toFixed(2)}
        </p>
      </div>
    `;
  });

  totalEl.innerText = "Total: $" + total.toFixed(2);
  profitTotalEl.innerText = "Profit: $" + profitTotal.toFixed(2);

  // alerts
  alertsList.forEach(a => {
    if (!a.triggered && data.prices[a.coin] >= a.price) {
      notify(`${a.coin} hit $${a.price}`);
      a.triggered = true;
      save();
    }
  });

  // chart
  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values }] }
  });
}

// REWARDS
function addTransaction() {
  transactions.push({
    gas: +gas.value || 0,
    dining: +dining.value || 0,
    groceries: +groceries.value || 0,
    other: +other.value || 0
  });

  save();
  loadRewards();
}

function resetMonth() {
  transactions = [];
  save();
  loadRewards();
}

async function loadRewards() {
  let gasT=0,dT=0,gT=0,oT=0;

  transactions.forEach(t=>{
    gasT+=t.gas;
    dT+=t.dining;
    gT+=t.groceries;
    oT+=t.other;
  });

  const gasReward = (Math.min(gasT,300)*0.04)+(Math.max(gasT-300,0)*0.01);
  const total = gasReward + dT*0.03 + gT*0.02 + oT*0.01;

  const res = await fetch("/sync");
  const data = await res.json();

  const xrp = total / (data.prices.XRP || 1);

  rewardsResult.innerHTML = `
    <p>Total Cashback: $${total.toFixed(2)}</p>
    <p>XRP Earned: ${xrp.toFixed(2)}</p>
  `;
}

// INIT
loadData();
loadRewards();
setInterval(loadData, 5000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

</script>

</body>
</html>
