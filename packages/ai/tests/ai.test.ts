import { MockLLMProvider } from '../src/mock-llm';
import { createLLMProvider } from '../src/factory';
import { proposeDiagnosis, proposeStrategy, extractPromiseToPay } from '../src/reasoning';
import { GroqProvider } from '../src/providers';

describe('MockLLMProvider structured outputs', () => {
  const llm = new MockLLMProvider();

  it('diagnoses from keywords with valid categories', async () => {
    const d = await proposeDiagnosis(llm, { failureReason: 'Insufficient funds', category: 'UNKNOWN', attemptCount: 1, amountMinor: 99900 });
    expect(d.category).toBe('INSUFFICIENT_FUNDS');
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(d.recoverability);
  });

  it('proposes valid strategy actions only', async () => {
    const s = await proposeStrategy(llm, { category: 'INSUFFICIENT_FUNDS', attemptCount: 1, maxPaymentRetries: 3, amountMinor: 99900, recoverability: 'HIGH' });
    expect(s.actions.length).toBeGreaterThan(0);
    for (const a of s.actions) {
      expect(['RETRY_PAYMENT', 'SEND_EMAIL', 'SEND_WHATSAPP', 'REQUEST_PAYMENT_METHOD_UPDATE', 'WAIT', 'ESCALATE', 'CLOSE']).toContain(a.type);
    }
  });

  it('extracts promise-to-pay from "I will pay Friday"', async () => {
    const p = await extractPromiseToPay(llm, "Sorry, I'll pay Friday");
    expect(p.isPromise).toBe(true);
    expect(p.promisedFor).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(p.confidence).toBeGreaterThan(0.5);
  });

  it('rejects non-promises', async () => {
    const p = await extractPromiseToPay(llm, 'This is a scam, stop emailing me');
    expect(p.isPromise).toBe(false);
  });
});

describe('reasoning validation of malformed LLM output', () => {
  it('maps invalid categories to UNKNOWN deterministically', async () => {
    const bad = new MockLLMProvider();
    // Force an invalid category via a stub.
    const stub: typeof bad & { name: string } = Object.assign(bad, {});
    stub.completeJSON = async () => ({ content: '{"category":"NOT_A_CATEGORY","rationale":"x","recoverability":"WEIRD","recommendedNextAction":"HACK"}', model: 'stub', provider: 'stub' });
    const d = await proposeDiagnosis(stub, { category: 'UNKNOWN', attemptCount: 1, amountMinor: 1 });
    expect(d.category).toBe('UNKNOWN');
    expect(d.recoverability).toBe('MEDIUM'); // invalid value coerced to default
    expect(d.recommendedNextAction).toBe('HACK'.slice(0, 64));
  });

  it('filters invalid action types and clamps delayHours', async () => {
    const stub = { completeJSON: async () => ({ content: JSON.stringify({ strategyName: 's', actions: [{ type: 'DELETE_DB' }, { type: 'RETRY_PAYMENT', delayHours: 9999 }] }), model: 'stub', provider: 'stub' }), name: 'stub' };
    const s = await proposeStrategy(stub as never, { category: 'UNKNOWN', attemptCount: 1, maxPaymentRetries: 3, amountMinor: 1, recoverability: 'HIGH' });
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0].type).toBe('RETRY_PAYMENT');
    expect(s.actions[0].delayHours).toBe(336); // clamped to max
  });

  it('throws on non-JSON content', async () => {
    const stub = { completeJSON: async () => ({ content: 'no json here', model: 'stub', provider: 'stub' }), name: 'stub' };
    await expect(proposeDiagnosis(stub as never, { category: 'UNKNOWN', attemptCount: 1, amountMinor: 1 })).rejects.toThrow('llm_invalid_json');
  });
});

describe('provider factory (spec §47 fallback)', () => {
  it('returns mock when no keys are present', () => {
    expect(createLLMProvider({}).name).toBe('mock');
  });
  it('honors LLM_FORCE_MOCK even with keys', () => {
    expect(createLLMProvider({ LLM_FORCE_MOCK: 'true', GROQ_API_KEY: 'g' }).name).toBe('mock');
  });
  it('selects groq when key present and first in order', () => {
    expect(createLLMProvider({ GROQ_API_KEY: 'g' }).name).toBe('groq');
  });
  it('falls back to openai when groq key missing', () => {
    expect(createLLMProvider({ LLM_PROVIDER_ORDER: 'groq,openai', OPENAI_API_KEY: 'o' }).name).toBe('openai');
  });
});

describe('GroqProvider construction', () => {
  it('requires an API key', () => {
    expect(() => new GroqProvider('')).toThrow('GROQ_API_KEY');
  });
});
