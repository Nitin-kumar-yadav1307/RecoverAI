import { EmailInput, MessagingProvider, MessagingResult } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts "a@b.c" or 'Display Name <a@b.c>' and returns the bare address. */
function extractAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/**
 * Resend email provider — real sending via the Resend HTTP API (§51).
 * Requires RESEND_API_KEY. Emails are sent with a branded RecoverAI template.
 */
export class ResendMessagingProvider implements MessagingProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly baseUrl = 'https://api.resend.com',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('ResendMessagingProvider requires RESEND_API_KEY');
    if (!EMAIL_RE.test(extractAddress(from))) throw new Error('RESEND_FROM must be a valid sender (verified domain)');
  }

  async sendEmail(input: EmailInput): Promise<MessagingResult> {
    if (!EMAIL_RE.test(input.to)) return { ok: false, provider: this.name, error: 'invalid recipient' };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [input.to], subject: input.subject, html: input.html }),
      });
    } catch (e) {
      return { ok: false, provider: this.name, error: `network: ${String(e)}` };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, provider: this.name, error: `http_${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, provider: this.name, messageId: json.id };
  }
}