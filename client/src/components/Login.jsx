import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSuccess({ credential }) {
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api('/api/auth/google', { method: 'POST', body: { credential } });
      setToken(token);
      onLogin(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">📈</div>
        <h1>Paper Trader</h1>
        <p className="muted">
          Start with <strong>$10,000</strong> in virtual cash and trade real US stocks at real market prices.
          Climb the leaderboard without risking a cent.
        </p>
        <div className="google-btn">
          {busy ? (
            <span className="muted">Signing you in…</span>
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google sign-in was cancelled or failed.')}
              theme="filled_black"
              shape="pill"
              text="continue_with"
            />
          )}
        </div>
        {error && <div className="alert error">{error}</div>}
      </div>
    </div>
  );
}
