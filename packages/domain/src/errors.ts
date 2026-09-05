/** Base domain error. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when money arithmetic mixes currencies or receives non-integer minor units. */
export class MoneyCurrencyMismatchError extends DomainError {
  constructor(message = 'Cannot combine amounts of different currencies.') {
    super(message);
  }
}

/** Thrown on an illegal recovery-case state transition (see state-machine.ts). */
export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Illegal transition from ${from} to ${to}.`);
  }
}

/** Thrown when a deterministic policy rule rejects an action. */
export class PolicyViolationError extends DomainError {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(`Policy violation: ${reasons.join('; ')}`);
    this.reasons = reasons;
  }
}

/** Thrown when a resource is accessed outside its owning merchant's scope. */
export class MerchantIsolationError extends DomainError {
  constructor(resource: string, expectedMerchant: string, actualMerchant: string) {
    super(
      `Merchant isolation violation on ${resource}: expected merchant ${expectedMerchant}, got ${actualMerchant}.`,
    );
  }
}