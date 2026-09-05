'use client';

/**
 * Thin client for the RecoverAI API. The JWT is held in sessionStorage
 * (demo scope). The merchant_id ALWAYS comes from the token server-side
 * (spec §41) — the browser never sends one.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface CaseRow {
  id: string;
  customer_id: string;
  status: string;
  risk_amount_inr: number;
  failure_category: string;
  priority: string;
  current_strategy: string | null;
  next_action_at: string | null;
  createdAt: string;
  customer: { name: string; email: string | null };
}

export interface OrchestratorResult {
  caseId: string;
  diagnosis: { category: string; recoverability: string; rationale: string };
  strategy: { name: string; proposed: number };
  policyDecision: string;
  policyReasons: string[];
  scheduledAction: { type: string; executeAt: string } | null;
  llmProvider: string;
}

export async function login(email: string, password: string): Promise<{ token: string; merchantName: string }> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const json = await res.json();
  sessionStorage.setItem('recoverai_token', json.token);
  sessionStorage.setItem('recoverai_merchant', json.merchantName);
  return json;
}

export function logout() {
  sessionStorage.removeItem('recoverai_token');
  sessionStorage.removeItem('recoverai_merchant');
}

export function token(): string | null {
  return sessionStorage.getItem('recoverai_token');
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const t = token();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...init?.headers },
  });
  if (res.status === 401) {
    logout();
    window.location.href = '/';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const getCases = () => api<{ cases: CaseRow[] }>('/recovery/cases');
export const getAnalytics = () =>
  api<{
    totalCases: number;
    recoveredCases: number;
    recoveryRatePct: number;
    revenueRecoveredInr: number;
    promises: { active: number; fulfilled: number; broken: number };
    byCategory: { category: string; count: number }[];
  }>('/recovery/analytics');
export const runAgent = (caseId: string) => api<OrchestratorResult>(`/recovery/cases/${caseId}/run`, { method: 'POST' });
export const recordPromise = (customerId: string, message: string) =>
  api<{ recorded: boolean; promisedFor?: string; confidence?: number; reason?: string }>('/recovery/promise-to-pay', {
    method: 'POST',
    body: JSON.stringify({ customerId, message }),
  });
