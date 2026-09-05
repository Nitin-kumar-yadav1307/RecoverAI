import { FailureCategory } from '@recoverai/domain';
import { LLMProvider } from './types';
import { DiagnosisProposal, StrategyProposal, PromiseToPayExtraction } from './types';

/**
 * Structured reasoning services. The LLM only PROPOSES; every output is
 * validated/normalized deterministically here before it can influence state
 * (spec §19: "the LLM proposes, the policy decides").
 */

const VALID_CATEGORIES = new Set<string>(Object.values(FailureCategory));

function extractJSON(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    // Tolerate fenced output.
    const m = /\{[\s\S]*\}/.exec(content);
    if (m) {
      try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* fallthrough */ }
    }
    throw new Error('llm_invalid_json');
  }
}

export async function proposeDiagnosis(
  llm: LLMProvider,
  input: { failureCode?: string; failureReason?: string; category: string; attemptCount: number; amountMinor: number },
): Promise<DiagnosisProposal> {
  const res = await llm.completeJSON([
    { role: 'system', content: 'You are a payment-recovery diagnosis engine. Respond ONLY with JSON: {"task":"diagnose","category":string,"rationale":string,"recoverability":"HIGH"|"MEDIUM"|"LOW","recommendedNextAction":string}. Category MUST come from: TEMPORARY_BANK_ISSUE, INSUFFICIENT_FUNDS, EXPIRED_CARD, CARD_DECLINED, NETWORK_ERROR, PAYMENT_METHOD_INVALID, PAYMENT_METHOD_EXPIRED, DO_NOT_HONOR, AUTHENTICATION_FAILED, RISK_FRAUD, PROVIDER_ERROR, HIGH_RISK, UNKNOWN.' },
    { role: 'user', content: JSON.stringify({ task: 'diagnose', ...input }) },
  ]);
  const raw = extractJSON(res.content);
  const category = VALID_CATEGORIES.has(String(raw.category)) ? (String(raw.category) as FailureCategory) : FailureCategory.UNKNOWN;
  return {
    category,
    rationale: String(raw.rationale ?? '').slice(0, 500),
    recoverability: raw.recoverability === 'HIGH' || raw.recoverability === 'LOW' ? raw.recoverability : 'MEDIUM',
    recommendedNextAction: String(raw.recommendedNextAction ?? 'RETRY_PAYMENT').slice(0, 64),
  };
}

const VALID_ACTION_TYPES = new Set(['RETRY_PAYMENT', 'SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE', 'WAIT', 'ESCALATE', 'CLOSE']);

export async function proposeStrategy(
  llm: LLMProvider,
  input: { category: string; attemptCount: number; maxPaymentRetries: number; amountMinor: number; recoverability: string },
): Promise<StrategyProposal> {
  const res = await llm.completeJSON([
    { role: 'system', content: 'You are a payment-recovery strategy planner. Respond ONLY with JSON: {"task":"strategy","strategyName":string,"actions":[{"type":string,"delayHours":number,"rationale":string}],"rationale":string}. Action types MUST come from: RETRY_PAYMENT, SEND_EMAIL, SEND_WHATSAPP, REQUEST_PAYMENT_METHOD_UPDATE, WAIT, ESCALATE, CLOSE. Propose at most 3 actions.' },
    { role: 'user', content: JSON.stringify({ task: 'strategy', ...input }) },
  ]);
  const raw = extractJSON(res.content);
  const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
  const actions = actionsRaw
    .slice(0, 3)
    .map((a) => a as { type?: string; delayHours?: number; rationale?: string })
    .filter((a) => a.type && VALID_ACTION_TYPES.has(String(a.type)))
    .map((a) => ({
      type: String(a.type),
      delayHours: typeof a.delayHours === 'number' && a.delayHours >= 0 ? Math.min(a.delayHours, 336) : 12,
      rationale: String(a.rationale ?? '').slice(0, 300),
    }));
  return {
    strategyName: String(raw.strategyName ?? 'unnamed').slice(0, 100),
    actions,
    rationale: String(raw.rationale ?? '').slice(0, 500),
  };
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export async function extractPromiseToPay(llm: LLMProvider, message: string): Promise<PromiseToPayExtraction> {
  const res = await llm.completeJSON([
    { role: 'system', content: 'You extract Promise-to-Pay intents from customer messages. Respond ONLY with JSON: {"task":"promise_to_pay","isPromise":boolean,"promisedFor":ISO-date-or-undefined,"confidence":number-0-to-1}. Resolve relative dates ("Friday", "tomorrow", "next week") to concrete ISO dates using the current date provided.' },
    { role: 'user', content: JSON.stringify({ task: 'promise_to_pay', currentDate: new Date().toISOString().slice(0, 10), message }) },
  ]);
  const raw = extractJSON(res.content);
  const isPromise = raw.isPromise === true;
  const promisedFor = typeof raw.promisedFor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.promisedFor) ? raw.promisedFor : undefined;
  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  if (isPromise && !promisedFor && DAY_NAMES.some((d) => message.toLowerCase().includes(d))) {
    throw new Error('llm_promise_without_date');
  }
  return { isPromise, promisedFor, confidence, sourceMessage: message.slice(0, 500) };
}
