'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCases, runAgent, token, OrchestratorResult, CaseRow } from '../../../lib/api';

const inr = (minor: number) => `\u20B9${(minor / 100).toLocaleString('en-IN')}`;

const STEPS = ['DIAGNOSE', 'STRATEGIZE', 'POLICY_GATE', 'SCHEDULE'] as const;

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<CaseRow | null>(null);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token()) { router.replace('/'); return; }
    try {
      const { cases } = await getCases();
      setRow(cases.find((c) => c.id === id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function onRunAgent() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await runAgent(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setBusy(false);
      void load();
    }
  }

  if (!row) return <div className="container"><p className="muted">Loading…</p>{error && <div className="error">{error}</div>}</div>;

  const hasStrategy = !!row.current_strategy;

  return (
    <div className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Case {row.id}</h1>
          <p className="muted">{row.customer.name} · {row.customer.email}</p>
        </div>
        <button className="secondary" onClick={() => router.push('/cases')}>← All cases</button>
      </div>

      <div className="card">
        <h2>Agent Reasoning</h2>
        <div className="pipeline">
          {STEPS.map((step, i) => (
            <div key={step} className={`pipeline-step ${hasStrategy ? 'done' : 'pending'}`}>
              <div className="pipeline-dot">{i + 1}</div>
              <div className="pipeline-label">{step}</div>
            </div>
          ))}
        </div>
        <div className="kv" style={{ marginTop: 16 }}>
          <span className="k">Failure</span><span>{row.failure_category.replaceAll('_', ' ')}</span>
          <span className="k">Strategy</span><span>{row.current_strategy ?? '—'}</span>
          <span className="k">Status</span><span><span className={`badge ${row.status}`}>{row.status}</span></span>
          <span className="k">Priority</span><span>{row.priority}</span>
          <span className="k">Amount at risk</span><span><strong>{inr(row.risk_amount_inr)}</strong></span>
          <span className="k">Next action</span><span>{row.next_action_at ? new Date(row.next_action_at).toLocaleString('en-IN') : '—'}</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={onRunAgent} disabled={busy}>{busy ? 'Agent running…' : '▶ Re-run agent loop'}</button>
          <span className="muted" style={{ marginLeft: 12 }}>Diagnose → strategy → policy gate → schedule</span>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {result && (
        <div className="card">
          <h2>Latest agent decision (LLM: {result.llmProvider})</h2>
          <div className="kv">
            <span className="k">Diagnosis</span><span>{result.diagnosis.category} · recoverability {result.diagnosis.recoverability}</span>
            <span className="k">Rationale</span><span className="muted">{result.diagnosis.rationale}</span>
            <span className="k">Strategy</span><span>{result.strategy.name} ({result.strategy.proposed} actions proposed)</span>
            <span className="k">Policy decision</span>
            <span><span className={`badge ${result.policyDecision === 'ALLOWED' ? 'SUCCEEDED' : 'FAILED'}`}>{result.policyDecision}</span></span>
            <span className="k">Reasons</span>
            <span className="muted">{result.policyReasons.join(' · ')}</span>
            <span className="k">Scheduled</span>
            <span>{result.scheduledAction ? `${result.scheduledAction.type} @ ${new Date(result.scheduledAction.executeAt).toLocaleString('en-IN')}` : 'nothing (blocked by policy)'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
