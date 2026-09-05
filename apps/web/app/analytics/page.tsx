"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAnalytics, getCases, token, CaseRow } from '../../lib/api';

interface Analytics { totalCases: number; recoveredCases: number; recoveryRatePct: number; revenueRecoveredInr: number; byCategory: { category: string; count: number }[]; promises: { active: number; fulfilled: number; broken: number }; }
const inr = (amountInr: number) => `₹${amountInr.toLocaleString('en-IN')}`;

export default function AnalyticsPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token()) { router.replace('/'); return; }
    try { const [a, { cases }] = await Promise.all([getAnalytics(), getCases()]); setAnalytics(a); setCases(cases); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  if (!analytics) return <div className="container"><p className="muted">Loading…</p></div>;

  const maxCategory = Math.max(...analytics.byCategory.map((c) => c.count), 1);
  const recentRecovered = cases.filter((c) => c.status === 'RECOVERED').slice(0, 5);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="sidebar">
        <div className="sidebar-brand">Recover<span>AI</span></div>
                <div className="sidebar-nav">
          <a href="/cases">Recovery Cases</a>
          <a href="/analytics" className="active">Analytics</a>
          <a href="/settings">Settings</a>
        </div>
      </div>
      <div className="main-content" style={{ flex: 1 }}>
        <div className="topbar">
          <div><div style={{ fontSize: 18, fontWeight: 600 }}>Analytics</div><div style={{ fontSize: 13, color: '#5f6368' }}>Recovery performance overview</div></div>
          <button className="secondary" onClick={() => router.replace('/')}>Sign out</button>
        </div>
        <div className="container">
          <div className="row" style={{ gap: 20, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>REVENUE RECOVERED</div><div style={{ fontSize: 32, fontWeight: 700, color: '#0b8b5b' }}>₹{analytics.revenueRecoveredInr.toLocaleString('en-IN')}</div></div>
            <div className="card" style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>RECOVERY RATE</div><div style={{ fontSize: 32, fontWeight: 700 }}>{analytics.recoveryRatePct}%</div></div>
            <div className="card" style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>TOTAL CASES</div><div style={{ fontSize: 32, fontWeight: 700 }}>{analytics.totalCases}</div></div>
            <div className="card" style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 500 }}>PROMISES KEPT</div><div style={{ fontSize: 32, fontWeight: 700 }}>{analytics.promises.fulfilled}</div></div>
          </div>
          <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
            <div className="card" style={{ flex: 2 }}>
              <h2>Recovery by Failure Category</h2>
              {analytics.byCategory.length === 0 ? <p className="muted">No data yet.</p> : (
                <div style={{ marginTop: 12 }}>
                  {analytics.byCategory.map((c) => (
                    <div key={c.category} style={{ marginBottom: 12 }}>
                      <div className="row spread" style={{ marginBottom: 4 }}><span style={{ fontSize: 13 }}>{c.category.replaceAll('_', ' ')}</span><span style={{ fontSize: 13, color: '#5f6368' }}>{c.count}</span></div>
                      <div style={{ height: 8, background: '#e8eaed', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(c.count / maxCategory) * 100}%`, background: '#1a73e8', borderRadius: 4 }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card" style={{ flex: 1 }}>
              <h2>Promise Outcomes</h2>
              <div style={{ marginTop: 12 }}>
                <div className="row spread" style={{ marginBottom: 8 }}><span style={{ fontSize: 13 }}>Active</span><span style={{ fontSize: 13, fontWeight: 600, color: '#1a73e8' }}>{analytics.promises.active}</span></div>
                <div className="row spread" style={{ marginBottom: 8 }}><span style={{ fontSize: 13 }}>Fulfilled</span><span style={{ fontSize: 13, fontWeight: 600, color: '#0b8b5b' }}>{analytics.promises.fulfilled}</span></div>
                <div className="row spread"><span style={{ fontSize: 13 }}>Broken</span><span style={{ fontSize: 13, fontWeight: 600, color: '#d93025' }}>{analytics.promises.broken}</span></div>
              </div>
            </div>
          </div>
          {recentRecovered.length > 0 && (
            <div className="card">
              <h2>Recently Recovered</h2>
              <table><thead><tr><th>Case</th><th>Customer</th><th>Amount</th><th>Strategy</th></tr></thead>
                <tbody>{recentRecovered.map((c) => (<tr key={c.id} className="clickable" onClick={() => router.push(`/cases/${c.id}`)}><td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.id.slice(-8)}</td><td>{c.customer.name}</td><td>{inr(c.risk_amount_inr)}</td><td style={{ color: '#5f6368' }}>{c.current_strategy ?? '—'}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
