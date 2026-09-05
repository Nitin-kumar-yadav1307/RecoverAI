import { FailureCategory } from '@recoverai/domain';

/**
 * LLMProvider abstraction — spec §10/§46: business logic never depends on Groq
 * directly. Groq is the primary provider; OpenAI is an optional fallback;
 * Mock is for tests only. The LLM proposes/understands; deterministic code
 * decides and executes (spec §19).
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletion {
  content: string;
  model: string;
  provider: string;
}

export interface LLMProvider {
  readonly name: string;
  /** Simple JSON-mode completion. Implementations should request JSON output. */
  completeJSON(messages: LLMMessage[]): Promise<LLMCompletion>;
}

/** AI-proposed diagnosis (validated downstream before it touches state). */
export interface DiagnosisProposal {
  category: FailureCategory;
  rationale: string;
  recoverability: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedNextAction: string;
}

/** AI-proposed strategy (the policy gate makes the final call). */
export interface StrategyProposal {
  strategyName: string;
  actions: Array<{ type: string; delayHours?: number; rationale: string }>;
  rationale: string;
}

/** Structured Promise-to-Pay extracted from a customer message (spec §53). */
export interface PromiseToPayExtraction {
  isPromise: boolean;
  promisedFor?: string; // ISO date
  confidence: number; // 0..1
  sourceMessage: string;
}
