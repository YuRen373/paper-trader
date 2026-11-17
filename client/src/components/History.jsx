import { useEffect, useState } from 'react';
import { api, usd, signedUsd, tone } from '../api.js';

export default function History() {
  const [trades, setTrades] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/trades').then(setTrades).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!trades) return <div className="card muted">Loading history…</div>;

  return (
    <div className="card">
      <h3>Trade history</h3>
      {trades.length === 0 ? (
        <div className="empty"><p>No trades yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Side</th>
                <th>Symbol</th>
                <th className="num">Shares</th>
                <th className="num">Price</th>
                <th className="num">Total</th>
                <th className="num">Realized P/L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td className="small">{new Date(t.createdAt).toLocaleString()}</td>
                  <td><span className={`pill ${t.side === 'BUY' ? 'buy' : 'sell'}`}>{t.side}</span></td>
                  <td className="sym">{t.symbol}</td>
                  <td className="num">{t.shares}</td>
                  <td className="num">{usd(t.price)}</td>
                  <td className="num">{usd(t.total)}</td>
                  <td className={`num ${tone(t.realizedPl)}`}>{t.realizedPl === null ? '—' : signedUsd(t.realizedPl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
