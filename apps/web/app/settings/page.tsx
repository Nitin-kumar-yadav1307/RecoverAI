"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAnalytics, token } from '../../lib/api';

interface Policy { max_payment_retries: number; retry_cooldown_hours: number; max_messages_per_period: number; message_period_hours: number; max_discount_percent: number; max_automatic_recovery_amount_minor: number; human_escalation_amount_minor: number; respect_promise_to_pay: boolean; allowed_channels: string[]; }

export default function SettingsPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token()) { router.replace('/'); return; }
    try {
      const a = await getAnalytics();
      setPolicy({ max_payment_retries: 3, retry_cooldown_hours: 12, max_messages_per_period: 2, message_period_hours: 168, max_discount_percent: 10, max_automatic_recovery_amount_minor: 2000000, human_escalation_amount_minor: 2000000, respect_promise_to_pay: true, allowed_channels: ['EMAIL', 'WHATSAPP'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function update(field: keyof Policy, value: number | boolean) {
    setPolicy((p) => p ? { ...p, [field]: value } : p);
    setSaved(false);
  }

  async function onSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!policy) return <div className="container"><p className="muted">Loading…</p></div>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="sidebar">
        <div className="sidebar-brand">Recover<span>AI</span></div>
                <div className="sidebar-nav">
          <a href="/cases">Recovery Cases</a>
          <a href="/analytics">Analytics</a>
          <a href="/settings" className="active">Settings</a>
        </div>
      </div>
      <div className="main-content" style={{ flex: 1 }}>
        <div className="topbar">
          <div><div style={{ fontSize: 18, fontWeight: 600 }}>Settings</div><div style={{ fontSize: 13, color: '#5f6368' }}>Recovery policy configuration</div></div>
          <button className="secondary" onClick={() => router.replace('/')}>Sign out</button>
        </div>
        <div className="container">
          <div className="card">
            <h2>Recovery Policy</h2>
            <p className="muted" style={{ marginTop: 0 }}>Configure how the AI agent recovers failed payments for your business.</p>
            <div className="kv">
              <span className="k">Max payment retries</span>
              <span><input type="number" value={policy.max_payment_retries} onChange={(e) => update('max_payment_retries', parseInt(e.target.value) || 0)} style={{ width: 80 }} /></span>
              <span className="k">Retry cooldown (hours)</span>
              <span><input type="number" value={policy.retry_cooldown_hours} onChange={(e) => update('retry_cooldown_hours', parseInt(e.target.value) || 0)} style={{ width: 80 }} /></span>
              <span className="k">Max messages per period</span>
              <span><input type="number" value={policy.max_messages_per_period} onChange={(e) => update('max_messages_per_period', parseInt(e.target.value) || 0)} style={{ width: 80 }} /></span>
              <span className="k">Message period (hours)</span>
              <span><input type="number" value={policy.message_period_hours} onChange={(e) => update('message_period_hours', parseInt(e.target.value) || 0)} style={{ width: 80 }} /></span>
              <span className="k">Max discount (%)</span>
              <span><input type="number" value={policy.max_discount_percent} onChange={(e) => update('max_discount_percent', parseInt(e.target.value) || 0)} style={{ width: 80 }} /></span>
              <span className="k">Auto-recovery limit</span>
              <span>₹{(policy.max_automatic_recovery_amount_minor / 100).toLocaleString('en-IN')}</span>
              <span className="k">Escalate above</span>
              <span>₹{(policy.human_escalation_amount_minor / 100).toLocaleString('en-IN')}</span>
              <span className="k">Respect Promise-to-Pay</span>
              <span>{policy.respect_promise_to_pay ? 'Yes' : 'No'}</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="primary" onClick={onSave}>Save policy</button>
              {saved && <span className="success" style={{ marginLeft: 12 }}>Policy saved.</span>}
            </div>
          </div>
          <div className="card">
            <h2>How the policy works</h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#5f6368' }}>
              <li>The AI proposes a recovery strategy (diagnose → strategize → act).</li>
              <li>This policy gate <strong>vetoes</strong> anything that breaks your rules.</li>
              <li>The LLM never moves money — the deterministic policy does.</li>
              <li>Promise-to-Pay suppresses outreach before the promised date.</li>
            </ul>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
