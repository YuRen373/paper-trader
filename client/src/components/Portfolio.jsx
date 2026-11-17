import { useState } from 'react';
import { api, usd, signedUsd, pct, tone } from '../api.js';

function Stat({ label, value, sub, subTone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${subTone || ''}`}>{sub}</div>}
    </div>
  );
}

export default function Portfolio({ user, portfolio, onTrade, onReset, onRefresh }) {
  const [resetting, setResetting] = useState(false);

  async function reset() {
    if (!window.confirm('Reset your account? All positions and history will be cleared and you start again with $10,000.')) return;
    setResetting(true);
    try {
      onReset(await api('/api/reset', { method: 'POST' }));
    } catch (e) {
      alert(e.message);
    } finally {
      setResetting(false);
    }
  }

  if (!portfolio) return <div className="card muted">Loading your portfolio…</div>;
  const p = portfolio;

  return (
    <>
      <h2>Hi {user.name.split(' ')[0]} 👋</h2>
      <div className="stats">
        <Stat label="Account value" value={usd(p.totalValue)} sub={`${signedUsd(p.totalReturn)} (${pct(p.totalReturnPct)}) all time`} subTone={tone(p.totalReturn)} />
        <Stat label="Today" value={signedUsd(p.dayChange)} sub={pct(p.dayChangePct)} subTone={tone(p.dayChange)} />
        <Stat label="Invested" value={usd(p.marketValue)} sub={`${p.positions.length} position${p.positions.length === 1 ? '' : 's'}`} />
        <Stat label="Cash" value={usd(p.cash)} sub={`of ${usd(p.startingCash)} starting`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Positions</h3>
          <button className="link" onClick={onRefresh}>Refresh</button>
        </div>
        {p.positions.length === 0 ? (
          <div className="empty">
            <p>You don't own any stocks yet.</p>
            <button className="btn primary" onClick={() => onTrade('')}>Make your first trade</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="num">Shares</th>
                  <th className="num">Price</th>
                  <th className="num">Avg cost</th>
                  <th className="num">Value</th>
                  <th className="num">Today</th>
                  <th className="num">Total gain</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.positions.map((pos) => (
                  <tr key={pos.symbol}>
                    <td className="sym">{pos.symbol}{pos.stale && <span className="muted small" title="Live price unavailable"> *</span>}</td>
                    <td className="num">{pos.shares}</td>
                    <td className="num">{usd(pos.price)}</td>
                    <td className="num">{usd(pos.avgCost)}</td>
                    <td className="num">{usd(pos.value)}</td>
                    <td className={`num ${tone(pos.dayChange)}`}>{signedUsd(pos.dayChange)}<br /><span className="small">{pct(pos.dayChangePct)}</span></td>
                    <td className={`num ${tone(pos.gain)}`}>{signedUsd(pos.gain)}<br /><span className="small">{pct(pos.gainPct)}</span></td>
                    <td className="num"><button className="btn small" onClick={() => onTrade(pos.symbol)}>Trade</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="danger-zone">
        <button className="link danger" onClick={reset} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset account to $10,000'}
        </button>
      </div>
    </>
  );
}
