// Single-player local-only data layer. Everything lives in localStorage; prices
// come straight from Finnhub. Components still call `api('/api/...')`, but the
// request is routed locally instead of hitting an Express server.

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const STATE_KEY = 'paper-trader:state';
const TOKEN_KEY = 'paper-trader-token';
const STARTING_CASH = 10000;

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ---------- Storage ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.user) return null;
    s.cash = Number(s.cash ?? STARTING_CASH);
    s.holdings = s.holdings || {};
    s.trades = s.trades || [];
    return s;
  } catch {
    return null;
  }
}

function saveState(s) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

function freshState(user) {
  return { user, cash: STARTING_CASH, holdings: {}, trades: [] };
}

function requireState() {
  const s = loadState();
  if (!s) throw httpError(401, 'Not signed in');
  return s;
}

// ---------- Finnhub ----------

const quoteCache = new Map(); // symbol -> { quote, at }

async function finnhub(path) {
  if (!FINNHUB_KEY) throw httpError(500, 'Finnhub API key is not configured. Set VITE_FINNHUB_API_KEY.');
  const sep = path.includes('?') ? '&' : '?';
  let res;
  try {
    res = await fetch(`${FINNHUB_BASE}${path}${sep}token=${FINNHUB_KEY}`);
  } catch {
    throw httpError(0, 'Cannot reach the price service.');
  }
  if (res.status === 429) throw httpError(503, 'Price service is busy, try again in a minute');
  if (!res.ok) throw httpError(502, `Price service error (${res.status})`);
  return res.json();
}

async function getQuote(symbol, maxAgeMs = 15000) {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.quote;

  let d;
  try {
    d = await finnhub(`/quote?symbol=${encodeURIComponent(symbol)}`);
  } catch (err) {
    if (hit && err.status === 503) return hit.quote;
    throw err;
  }
  if (!d || !d.c) throw httpError(404, `No price found for ${symbol}`);

  const quote = {
    symbol,
    price: d.c,
    change: d.d ?? 0,
    changePct: d.dp ?? 0,
    open: d.o,
    high: d.h,
    low: d.l,
    prevClose: d.pc,
    time: d.t ? d.t * 1000 : Date.now(),
  };
  quoteCache.set(symbol, { quote, at: Date.now() });
  return quote;
}

async function getQuotes(symbols) {
  const unique = [...new Set(symbols)];
  const results = await Promise.allSettled(unique.map((s) => getQuote(s)));
  return Object.fromEntries(unique.map((s, i) => [s, results[i].status === 'fulfilled' ? results[i].value : null]));
}

async function searchSymbols(q) {
  const d = await finnhub(`/search?q=${encodeURIComponent(q)}&exchange=US`);
  return (d.result || [])
    .filter((r) => ['Common Stock', 'ETP', 'ADR'].includes(r.type) && !r.symbol.includes(':'))
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.description, type: r.type }));
}

// ---------- Helpers ----------

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
function cleanSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw httpError(400, 'Invalid ticker symbol');
  return symbol;
}

const round2 = (n) => Math.round(n * 100) / 100;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function decodeJwt(token) {
  const payload = token.split('.')[1];
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const json = decodeURIComponent(
    atob(pad)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
  return JSON.parse(json);
}

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  picture: u.picture,
  cash: u.cash,
  createdAt: u.createdAt,
});

// ---------- Portfolio ----------

async function buildPortfolio(state) {
  const symbols = Object.keys(state.holdings);
  const quotes = await getQuotes(symbols);

  let marketValue = 0;
  let dayChange = 0;
  const positions = symbols
    .sort()
    .map((symbol) => {
      const h = state.holdings[symbol];
      const q = quotes[symbol];
      const avgCost = Number(h.avgCost);
      const price = q ? q.price : avgCost;
      const value = price * h.shares;
      const cost = avgCost * h.shares;
      marketValue += value;
      dayChange += q ? q.change * h.shares : 0;
      return {
        symbol,
        shares: h.shares,
        avgCost: round2(avgCost),
        price,
        value: round2(value),
        costBasis: round2(cost),
        gain: round2(value - cost),
        gainPct: cost ? ((value - cost) / cost) * 100 : 0,
        dayChange: q ? round2(q.change * h.shares) : 0,
        dayChangePct: q ? q.changePct : 0,
        stale: !q,
      };
    });

  const totalValue = state.cash + marketValue;
  const prevValue = totalValue - dayChange;
  return {
    cash: round2(state.cash),
    marketValue: round2(marketValue),
    totalValue: round2(totalValue),
    startingCash: STARTING_CASH,
    totalReturn: round2(totalValue - STARTING_CASH),
    totalReturnPct: ((totalValue - STARTING_CASH) / STARTING_CASH) * 100,
    dayChange: round2(dayChange),
    dayChangePct: prevValue ? (dayChange / prevValue) * 100 : 0,
    positions,
  };
}

// ---------- Handlers ----------

async function authGoogle(body) {
  const credential = body?.credential;
  if (!credential) throw httpError(400, 'Missing Google credential');
  let g;
  try {
    g = decodeJwt(credential);
  } catch {
    throw httpError(401, 'Google sign-in could not be verified');
  }

  const existing = loadState();
  let state;
  let isNew = false;
  if (existing && existing.user.id === g.sub) {
    state = {
      ...existing,
      user: { ...existing.user, email: g.email, name: g.name || g.email, picture: g.picture || null },
    };
  } else {
    state = freshState({
      id: g.sub,
      email: g.email,
      name: g.name || g.email,
      picture: g.picture || null,
      createdAt: new Date().toISOString(),
    });
    isNew = true;
  }
  saveState(state);
  return { token: credential, user: { ...publicUser(state.user), cash: state.cash }, isNew };
}

function me() {
  const s = requireState();
  return { ...publicUser(s.user), cash: s.cash };
}

async function placeOrder(body) {
  const state = requireState();
  const symbol = cleanSymbol(body?.symbol);
  const side = String(body?.side || '').toUpperCase();
  const shares = Number(body?.shares);
  if (!['BUY', 'SELL'].includes(side)) throw httpError(400, 'Side must be BUY or SELL');
  if (!Number.isInteger(shares) || shares < 1 || shares > 1_000_000) {
    throw httpError(400, 'Shares must be a whole number between 1 and 1,000,000');
  }

  const quote = await getQuote(symbol, 5000);
  const price = quote.price;
  const total = round2(price * shares);

  const held = state.holdings[symbol];
  const owned = held?.shares ?? 0;
  const avgCost = Number(held?.avgCost ?? 0);
  let realizedPl = null;

  if (side === 'BUY') {
    if (total > state.cash) {
      throw httpError(400, `Not enough cash: this order costs $${total.toFixed(2)} and you have $${state.cash.toFixed(2)}`);
    }
    const newShares = owned + shares;
    const newAvg = (owned * avgCost + price * shares) / newShares;
    state.holdings[symbol] = { shares: newShares, avgCost: newAvg };
    state.cash = round2(state.cash - total);
  } else {
    if (shares > owned) throw httpError(400, `You only own ${owned} share${owned === 1 ? '' : 's'} of ${symbol}`);
    realizedPl = round2(total - avgCost * shares);
    if (shares === owned) {
      delete state.holdings[symbol];
    } else {
      state.holdings[symbol] = { shares: owned - shares, avgCost };
    }
    state.cash = round2(state.cash + total);
  }

  const trade = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    symbol,
    side,
    shares,
    price,
    total,
    realizedPl,
    createdAt: new Date().toISOString(),
  };
  state.trades.unshift(trade);
  if (state.trades.length > 500) state.trades.length = 500;
  saveState(state);
  return trade;
}

function listTrades() {
  const s = requireState();
  return s.trades.slice(0, 200);
}

async function reset() {
  const s = requireState();
  const cleared = { ...s, cash: STARTING_CASH, holdings: {}, trades: [] };
  saveState(cleared);
  return buildPortfolio(cleared);
}

// ---------- Router ----------

export async function api(path, { method = 'GET', body } = {}) {
  // POST /api/auth/google
  if (path === '/api/auth/google' && method === 'POST') return authGoogle(body);
  // GET /api/me
  if (path === '/api/me' && method === 'GET') return me();
  // GET /api/portfolio
  if (path === '/api/portfolio' && method === 'GET') return buildPortfolio(requireState());
  // GET /api/quote/:symbol
  if (path.startsWith('/api/quote/') && method === 'GET') {
    return getQuote(cleanSymbol(decodeURIComponent(path.slice('/api/quote/'.length))));
  }
  // GET /api/search?q=...
  if (path.startsWith('/api/search') && method === 'GET') {
    const q = new URLSearchParams(path.split('?')[1] || '').get('q') || '';
    return q.trim() ? searchSymbols(q.trim().slice(0, 30)) : [];
  }
  // POST /api/orders
  if (path === '/api/orders' && method === 'POST') return placeOrder(body);
  // GET /api/trades
  if (path === '/api/trades' && method === 'GET') return listTrades();
  // POST /api/reset
  if (path === '/api/reset' && method === 'POST') return reset();

  throw httpError(404, `Unknown endpoint ${method} ${path}`);
}

// ---------- Formatters ----------

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const usd = (n) => usdFmt.format(n ?? 0);
export const signedUsd = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${usdFmt.format(Math.abs(n ?? 0))}`;
export const pct = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n ?? 0).toFixed(2)}%`;
export const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
