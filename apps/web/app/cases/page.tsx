'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCases, getAnalytics, logout, recordPromise, token, CaseRow } from '../../lib/api';

interface Analytics {
  totalCases: number;
  recoveredCases: number;
  recoveryRatePct: number;
  revenueRecoveredInr: number;
  promises: { active: number; fulfilled: number; broken: number };
}

const inr = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [promiseMsg, setPromiseMsg] = useState('');
  const [promiseResult, setPromiseResult] = useState('');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [checkoutMsg, setCheckoutMsg] = useState('');

  const load = useCallback(async () => {
    if (!token()) { router.replace('/'); return; }
    try {
      const [{ cases }, a] = await Promise.all([getCases(), getAnalytics()]);
      setCases(cases);
      setAnalytics(a);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function onRecordPromise() {
    if (!cases[0] || !promiseMsg.trim()) return;
    setPromiseResult('');
    try {
      const r = await recordPromise(cases[0].customer_id, promiseMsg);
      setPromiseResult(r.recorded ? `Promise recorded for ${r.promisedFor} (confidence ${((r.confidence ?? 0) * 100).toFixed(0)}%)` : r.reason ?? 'No promise detected');
    } catch (e) {
      setPromiseResult(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function openCheckout() {
    setCheckoutMsg('Creating order...');
    try {
      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor: 249900 }),
      });
      const data = await res.json();
      if (data.error) { setCheckoutMsg(data.error); return; }
      setCheckoutMsg('Opening Razorpay checkout...');

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'RecoverAI',
        description: 'Pro Plan — Test Payment',
        order_id: data.orderId,
        handler: function () {
          setCheckoutMsg('Payment successful! Recovery case will update shortly.');
          setTimeout(() => load(), 3000);
        },
        prefill: { name: 'Demo Customer', email: 'demo@test.com' },
        theme: { color: '#2563eb' },
        modal: {
          ondismiss: function () {
            setCheckoutMsg('Payment closed. The recovery case is still open.');
          },
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e) {
      setCheckoutMsg(e instanceof Error ? e.message : 'Failed to open checkout');
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="sidebar">
        <div className="sidebar-brand">Recover<span>AI</span></div>
                <div className="sidebar-nav">
          <a href="/cases" className="active">Recovery Cases</a>
          <a href="/analytics">Analytics</a>
          <a href="/settings">Settings</a>
        </div>
      </div>
      <div className="main-content" style={{ flex: 1 }}>
        <div className="topbar">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Recovery Cases</div>
            <div style={{ fontSize: 13, color: '#5f6368' }}>{typeof window !== 'undefined' ? sessionStorage.getItem('recoverai_merchant') : ''}</div>
          </div>
          <button className="secondary" onClick={() => { logout(); router.replace('/'); }}>Sign out</button>
        </div>
        <div className="container">
          <div className="card">
            <h2>Simulate Payment</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Opens Razorpay&apos;s native checkout. Test cards: <strong>4100 2800 0004 0005</strong> (decline) · <strong>4100 2800 0000 1007</strong> (success).
            </p>
            <button className="primary" onClick={openCheckout}>Pay with Razorpay — ₹2,499</button>
            {checkoutMsg && <p className="muted" style={{ marginTop: 8 }}>{checkoutMsg}</p>}
          </div>

              {analytics && (
            <div className="card">
              <h2>Recovery Analytics</h2>
              <div className="row" style={{ gap: 40 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>REVENUE RECOVERED</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#0b8b5b' }}>₹{analytics.revenueRecoveredInr.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>RECOVERY RATE</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{analytics.recoveryRatePct}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>CASES</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{analytics.recoveredCases}/{analytics.totalCases}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>PROMISES (ACTIVE/KEPT)</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{analytics.promises.active}/{analytics.promises.fulfilled}</div>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Open Cases</h2>
            {busy ? <p className="muted">Loading…</p> : (
              <table>
                <thead><tr><th>Customer</th><th>Amount</th><th>Failure</th><th>Priority</th><th>Status</th><th>Strategy</th></tr></thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => router.push(`/cases/${c.id}`)}>
                      <td>{c.customer.name}<br /><span style={{ fontSize: 12, color: '#5f6368' }}>{c.customer.email}</span></td>
                      <td>{inr(c.risk_amount_inr)}</td>
                      <td>{c.failure_category.replaceAll('_', ' ')}</td>
                      <td>{c.priority}</td>
                      <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                      <td style={{ color: '#5f6368' }}>{c.current_strategy ?? '—'}</td>
                    </tr>
                  ))}
                  {cases.length === 0 && <tr><td colSpan={6} className="muted">No recovery cases yet.</td></tr>}
                </tbody>
              </table>
            )}
            {error && <div className="error">{error}</div>}
          </div>

          <div className="card">
            <h2>Promise-to-Pay Intake</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Paste a customer message — the agent extracts structured Promise-to-Pay state.
            </p>
            <div className="row">
              <textarea value={promiseMsg} onChange={(e) => setPromiseMsg(e.target.value)} rows={2} placeholder="e.g. Sorry, I'll pay Friday" style={{ flex: 1 }} />
              <button className="accent" onClick={onRecordPromise} disabled={!promiseMsg.trim()}>Extract</button>
            </div>
            {promiseResult && <div className="success">{promiseResult}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
