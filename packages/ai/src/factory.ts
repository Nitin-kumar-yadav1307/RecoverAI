import { GroqProvider, OpenAIProvider } from './providers';
import { MockLLMProvider } from './mock-llm';
import { LLMProvider } from './types';

/**
 * Provider factory — attempts providers in LLM_PROVIDER_ORDER (default
 * "groq,openai,mock"), skipping any whose credentials are missing, and
 * guaranteeing a usable provider (mock) at the end. Spec §47 fallback.
 */
export function createLLMProvider(env: {
  LLM_PROVIDER_ORDER?: string;
  LLM_FORCE_MOCK?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}): LLMProvider {
  if (env.LLM_FORCE_MOCK === 'true') return new MockLLMProvider();

  const order = (env.LLM_PROVIDER_ORDER ?? 'groq,openai,mock').split(',').map((s) => s.trim().toLowerCase());
  const errors: string[] = [];
  for (const name of order) {
    try {
      if (name === 'groq' && env.GROQ_API_KEY) return new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL);
      if (name === 'openai' && env.OPENAI_API_KEY) return new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
      if (name === 'mock') return new MockLLMProvider();
    } catch (e) {
      errors.push(String(e));
    }
  }
  return new MockLLMProvider();
}
