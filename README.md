# Paper Trader — $10k mock brokerage

A stock-market practice app. Start with **$10,000 in virtual cash** and buy/sell real US stocks and ETFs at **live real-world prices**. Portfolio tracking, trade history, and account reset — all running in your browser.

- **Frontend:** React (Vite), hosted free on **GitHub Pages**
- **Data storage:** your browser's `localStorage` — no server, no database
- **Prices:** **Finnhub** free API (60 requests/min), called directly from the browser
- **Sign-in:** Google (client-side only — just for showing your name and avatar)

```
┌──────────────────────────┐
│ React app                │ ◀──── Google Identity (ID token decoded in-browser)
│ USER.github.io/REPO      │
│                          │ ◀──── Finnhub quote / search API (direct)
│  localStorage:           │
│   • user                 │
│   • cash                 │
│   • holdings             │
│   • trade history        │
└──────────────────────────┘
```

Because there is no server and no shared database, this is a **single-player practice app**. Your portfolio only exists in the browser you signed in from — clear site data and it's gone. There's no global leaderboard, and nothing stops you from reading the code; it's for learning how trading works, not for competition.

## Features

- Google sign-in; first login creates the account with $10,000
- Search any US stock/ETF, live quote (auto-refresh every 15s)
- Market buy/sell at the current real price (whole shares)
- Portfolio: account value, all-time return, today's change, per-position gain/loss
- Trade history with realized profit/loss on sells
- Reset account back to $10,000

## Setup (about 10 minutes, all free)

### 1. Push this folder to GitHub
Create a repo (e.g. `paper-trader`) and push everything in this folder to the `main` branch.

### 2. Prices — Finnhub
Sign up at [finnhub.io](https://finnhub.io/register) and copy your API key.

> **Note:** this key ships inside the bundled JavaScript, so anyone who visits your Pages URL can see and use it. Finnhub's free tier is 60 req/min; if that matters to you, don't share the URL publicly.

### 3. Google sign-in
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Configure the **OAuth consent screen** if asked (External, app name, your email). Add yourself as a test user, or publish the app so anyone can sign in.
3. **Create credentials → OAuth client ID → Web application.**
4. **Authorized JavaScript origins** — add both:
   - `https://YOUR_GITHUB_USERNAME.github.io`
   - `http://localhost:5173`
   (No redirect URIs needed.)
5. Copy the **Client ID**.

### 4. Frontend — GitHub Pages
1. In your repo: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** tab, add:
   - `VITE_GOOGLE_CLIENT_ID` = Google Client ID
   - `VITE_FINNHUB_API_KEY` = Finnhub key
3. **Actions → Deploy client to GitHub Pages → Run workflow** (it also runs on every push to `main` that touches `client/`).
4. Open `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/`.

## Run locally

Requires Node 18+.

```bash
cd client
cp .env.example .env     # fill in VITE_GOOGLE_CLIENT_ID and VITE_FINNHUB_API_KEY
npm install
npm run dev              # http://localhost:5173
```

On Windows PowerShell use `copy` instead of `cp`.

## Project layout

```
client/                         React app → GitHub Pages
  src/main.jsx                  GoogleOAuthProvider
  src/App.jsx                   session, tabs, 30s auto-refresh
  src/api.js                    local data layer + Finnhub proxy (routes /api/* to localStorage)
  src/components/               Login, Portfolio, Trade, History
.github/workflows/deploy-pages.yml   builds and publishes the client
```

## Data model (`localStorage`)

Stored under the key `paper-trader:state`:

```json
{
  "user":     { "id", "email", "name", "picture", "createdAt" },
  "cash":     10000,
  "holdings": { "AAPL": { "shares": 10, "avgCost": 180.12 } },
  "trades":   [ { "id", "symbol", "side", "shares", "price", "total", "realizedPl", "createdAt" } ]
}
```

Resetting the account clears holdings and trades and sets `cash` back to `10000`. "Sign out" clears the saved Google token but leaves the state — sign back in with the same Google account and your portfolio is still there.

## Honest limitations

- **Single device.** No server means no sync. Different browser, different portfolio.
- **The Finnhub key is public.** Treat anyone with your Pages URL as sharing your 60 req/min quota.
- **No anti-cheat.** Open DevTools and you can rewrite your cash. That's fine — this is a practice tool for one person, not a contest.
- **No real-time market hours handling.** When the market is closed, Finnhub returns the last traded price.

## Ideas to extend

- Respect market hours (reject or warn when NYSE is closed)
- Limit / stop orders checked by a scheduled interval while the tab is open
- Export / import portfolio as JSON so you can back it up
- Daily account-value snapshots for a performance chart
- Fractional shares, crypto, or non-US markets
