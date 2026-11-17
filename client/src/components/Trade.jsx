import { useEffect, useState } from 'react';
import { api, usd, signedUsd, pct, tone } from '../api.js';

export default function Trade({ initialSymbol, portfolio, onTraded }) {
  const [query, setQuery] = useState(initialSymbol || '');
  const [results, setResults] = useState([]);
  const [symbol, setSymbol] = useState(initialSymbol || '');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [side, setSide] = useState('BUY');
  const [shares, setShares] = useState('1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Search as you type (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!q || q.toUpperCase() === symbol) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(id);
  }, [query, symbol]);

  // Load the live quote for the chosen symbol and refresh it every 15s.
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    setQuote(null);
    setQuoteError('');
    const load = () =>
      api(`/api/quote/${encodeURIComponent(symbol)}`)
        .then((q) => alive && setQuote(q))
        .catch((e) => alive && setQuoteError(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  function choose(sym) {
    const s = sym.trim().toUpperCase();
    setSymbol(s);
    setQuery(s);
    setResults([]);
    setMsg(null);
  }

  const qty = Number(shares);
  const validQty = Number.isInteger(qty) && qty > 0;
  const cash = portfolio?.cash ?? 0;
  const owned = portfolio?.positions.find((p) => p.symbol === symbol)?.shares ?? 0;
  const estimate = quote && validQty ? quote.price * qty : 0;
  const maxBuy = quote ? Math.floor(cash / quote.price) : 0;
  const tooMuch = side === 'BUY' ? estimate > cash : qty > owned;

  async function submit(e) {
    e.preventDefault();
    if (!quote || !validQty || tooMuch) return;
    setBusy(true);
    setMsg(null);
    try {
      const t = await api('/api/orders', { method: 'POST', body: { symbol, side, shares: qty } });
      const verb = t.side === 'BUY' ? 'Bought' : 'Sold';
      const pl = t.realizedPl !== null ? ` · realized ${signedUsd(t.realizedPl)}` : '';
      setMsg({ type: 'success', text: `${verb} ${t.shares} ${t.symbol} at ${usd(t.price)} for ${usd(t.total)}${pl}` });
      setShares('1');
      await onTraded();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="trade-grid">
      <div className="card">
        <h3>Find a stock</h3>
        <div className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && choose(query)}
            placeholder="Search by name or ticker, e.g. Apple or AAPL"
            autoFocus
          />
          {results.length > 0 && (
            <ul className="results">
              {results.map((r) => (
                <li key={r.symbol} onClick={() => choose(r.symbol)}>
                  <span className="sym">{r.symbol}</span>
                  <span className="muted small">{r.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {symbol && (
          <div className="quote">
            {quoteError && <div className="alert error">{quoteError}</div>}
            {!quote && !quoteError && <div className="muted">Loading {symbol}…</div>}
            {quote && (
              <>
                <div className="quote-head">
                  <span className="quote-sym">{quote.symbol}</span>
                  <span className="quote-price">{usd(quote.price)}</span>
                  <span className={tone(quote.change)}>{signedUsd(quote.change)} ({pct(quote.changePct)})</span>
                </div>
                <div className="quote-meta muted small">
                  <span>Open {usd(quote.open)}</span>
                  <span>High {usd(quote.high)}</span>
                  <span>Low {usd(quote.low)}</span>
                  <span>Prev close {usd(quote.prevClose)}</span>
                  <span>Updated {new Date(quote.time).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <form className="card order" onSubmit={submit}>
        <h3>Order</h3>
        <div className="seg">
          <button type="button" className={side === 'BUY' ? 'on buy' : ''} onClick={() => setSide('BUY')}>Buy</button>
          <button type="button" className={side === 'SELL' ? 'on sell' : ''} onClick={() => setSide('SELL')}>Sell</button>
        </div>

        <label>
          Shares
          <input type="number" min="1" step="1" value={shares} onChange={(e) => setShares(e.target.value)} />
        </label>
        {quote && (
          <div className="quick">
            {side === 'BUY' ? (
              <button type="button" className="link" onClick={() => setShares(String(Math.max(maxBuy, 1)))}>Max: {maxBuy}</button>
            ) : (
              owned > 0 && <button type="button" className="link" onClick={() => setShares(String(owned))}>Sell all: {owned}</button>
            )}
          </div>
        )}

        <dl className="summary">
          <dt>Market price</dt><dd>{quote ? usd(quote.price) : '—'}</dd>
          <dt>Estimated {side === 'BUY' ? 'cost' : 'proceeds'}</dt><dd>{usd(estimate)}</dd>
          <dt>Cash available</dt><dd>{usd(cash)}</dd>
          <dt>You own</dt><dd>{owned} {symbol || ''}</dd>
        </dl>

        {quote && validQty && tooMuch && (
          <div className="alert error small">
            {side === 'BUY' ? 'Not enough cash for this order.' : `You only own ${owned} shares.`}
          </div>
        )}

        <button className={`btn primary block ${side === 'SELL' ? 'sell' : ''}`} disabled={!quote || !validQty || tooMuch || busy}>
          {busy ? 'Placing order…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${validQty ? qty : ''} ${symbol || ''}`}
        </button>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <p className="muted small">Market orders fill instantly at the latest real price. When the market is closed, that is the last traded price.</p>
      </form>
    </div>
  );
}
