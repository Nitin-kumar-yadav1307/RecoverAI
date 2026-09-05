'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@acme.in');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.push('/cases');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#072654' }}>Recover<span style={{ color: '#1a73e8' }}>AI</span></div>
          <div style={{ color: '#5f6368', fontSize: 14, marginTop: 4 }}>Failed Payment Recovery · Powered by Razorpay</div>
        </div>
        <div className="card" style={{ boxShadow: '0 4px 12px rgba(60,64,67,0.15)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#202124', textTransform: 'none', letterSpacing: 0, marginBottom: 20 }}>Sign in</h2>
          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5f6368', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5f6368', marginBottom: 6 }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="primary" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {error && <div className="error">{error}</div>}
          </form>
        </div>
        <div style={{ textAlign: 'center', color: '#80868b', fontSize: 12, marginTop: 16 }}>
          Demo: demo@acme.in / demo1234
        </div>
      </div>
    </div>
  );
}
