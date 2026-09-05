import { EmailInput, MessagingProvider, MessagingResult } from './types';

/**
 * MockMessagingProvider — simulator (tests / keyless runs / demo). It does NOT
 * send anything: it records the would-be email. Never the primary impl (§71).
 */
export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock-email';
  private sent: EmailInput[] = [];

  constructor(private readonly capture: (m: EmailInput) => void = () => { }) {}

  /** All sends recorded so far (useful in tests).). */
  get history(): ReadonlyArray<EmailInput> { return this.sent; }

  async sendEmail(input: EmailInput): Promise<MessagingResult> {
    const id = `mock_msg_${this.sent.length + 1}`;
    this.sent.push(input);
    this.capture(input);
    return { ok: true, provider: this.name, messageId: id };
  }
}