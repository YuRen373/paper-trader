import { useCallback, useEffect, useState } from 'react';
import { googleLogout } from '@react-oauth/google';
import { api, getToken, clearToken, usd } from './api.js';
import Login from './components/Login.jsx';
import Portfolio from './components/Portfolio.jsx';
import Trade from './components/Trade.jsx';
import History from './components/History.jsx';

const TABS = [
  ['portfolio', 'Portfolio'],
  ['trade', 'Trade'],
  ['history', 'History'],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('portfolio');
  const [portfolio, setPortfolio] = useState(null);
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [error, setError] = useState('');

  function signOut() {
    clearToken();
    googleLogout();
    setUser(null);
    setPortfolio(null);
    setTab('portfolio');
  }

  // Restore a saved session on page load.
  useEffect(() => {
    if (!getToken()) return;
    api('/api/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      setPortfolio(await api('/api/portfolio'));
      setError('');
    } catch (e) {
      if (e.status === 401) signOut();
      else setError(e.message);
    }
  }, []);

  // Refresh prices every 30 seconds while signed in.
  useEffect(() => {
    if (!user) return;
    loadPortfolio();
    const id = setInterval(loadPortfolio, 30000);
    return () => clearInterval(id);
  }, [user, loadPortfolio]);

  function openTrade(symbol) {
    setTradeSymbol(symbol);
    setTab('trade');
  }

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">📈 Paper Trader</div>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="me">
          {portfolio && <span className="cash">Cash {usd(portfolio.cash)}</span>}
          {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <button className="link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main>
        {error && <div className="alert error">{error}</div>}
        {tab === 'portfolio' && (
          <Portfolio
            user={user}
            portfolio={portfolio}
            onTrade={openTrade}
            onReset={setPortfolio}
            onRefresh={loadPortfolio}
          />
        )}
        {tab === 'trade' && (
          <Trade key={tradeSymbol} initialSymbol={tradeSymbol} portfolio={portfolio} onTraded={loadPortfolio} />
        )}
        {tab === 'history' && <History />}
      </main>

      <footer className="muted small">
        Simulated trading with virtual money, saved in this browser only. Prices from Finnhub, may be delayed. Not investment advice.
      </footer>
    </div>
  );
}
