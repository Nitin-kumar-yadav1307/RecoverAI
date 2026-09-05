import { LLMCompletion, LLMMessage, LLMProvider } from './types';

/**
 * GroqProvider — primary real provider (OpenAI-compatible chat completions API).
 * No business logic depends on Groq specifics — only this class does.
 */
export class GroqProvider implements LLMProvider {
  readonly name = 'groq';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'llama-3.3-70b-versatile',
    private readonly baseUrl = 'https://api.groq.com/openai/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('GroqProvider requires GROQ_API_KEY');
  }

  async completeJSON(messages: LLMMessage[]): Promise<LLMCompletion> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`groq_http_${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('groq_empty_completion');
    return { content, model: json.model ?? this.model, provider: this.name };
  }
}

/**
 * OpenAIProvider — optional fallback, same wire format, different base URL/key.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly baseUrl = 'https://api.openai.com/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('OpenAIProvider requires OPENAI_API_KEY');
  }

  async completeJSON(messages: LLMMessage[]): Promise<LLMCompletion> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`openai_http_${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai_empty_completion');
    return { content, model: json.model ?? this.model, provider: this.name };
  }
}
