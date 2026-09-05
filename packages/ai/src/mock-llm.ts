import { LLMCompletion, LLMMessage, LLMProvider } from './types';

/**
 * MockLLMProvider — deterministic, tests and keyless local runs ONLY (spec §71).
 * Produces valid structured JSON for every supported task based on keyword
 * rules; never used in the demo when a real key is present.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async completeJSON(messages: LLMMessage[]): Promise<LLMCompletion> {
    const last = messages[messages.length - 1]?.content ?? '';
    const lower = last.toLowerCase();
    const task = /"task":\s*"([^"]+)"/.exec(last)?.[1] ?? 'diagnose';

    if (task === 'promise_to_pay') {
      const day = /friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next week/.exec(lower)?.[0];
      const isPromise = /pay|clear|settle/.test(lower) && !!day;
      return {
        provider: this.name,
        model: 'mock',
        content: JSON.stringify({
          isPromise,
          promisedFor: isPromise ? dayToIso(day as string) : undefined,
          confidence: isPromise ? 0.9 : 0.1,
        }),
      };
    }

    if (task === 'strategy') {
      return {
        provider: this.name,
        model: 'mock',
        content: JSON.stringify({
          strategyName: 'gentle_retry_then_message',
          actions: [
            { type: 'RETRY_PAYMENT', delayHours: 12, rationale: 'mock: temporary failure, retry soon' },
            { type: 'SEND_EMAIL', delayHours: 24, rationale: 'mock: inform customer' },
          ],
          rationale: 'Mock strategy for testing.',
        }),
      };
    }

    // diagnose (default)
    const category = lower.includes('insufficient') ? 'INSUFFICIENT_FUNDS'
      : lower.includes('expired') ? 'EXPIRED_CARD'
      : lower.includes('network') ? 'NETWORK_ERROR'
      : 'UNKNOWN';
    return {
      provider: this.name,
      model: 'mock',
      content: JSON.stringify({
        category,
        rationale: 'Mock diagnosis based on keyword rules.',
        recoverability: category === 'INSUFFICIENT_FUNDS' ? 'HIGH' : 'MEDIUM',
        recommendedNextAction: 'RETRY_PAYMENT',
      }),
    };
  }
}

function dayToIso(day: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  const target = days.indexOf(day);
  const delta = target >= 0 ? (target - now.getUTCDay() + 7 || 7) : 1;
  const d = new Date(now.getTime() + delta * 86_400_000);
  return d.toISOString();
}
