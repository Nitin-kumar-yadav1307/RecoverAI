import { RecoveryCaseStatus } from './enums';
import { InvalidStateTransitionError } from './errors';

/**
 * Recovery workflow state machine. See spec §37.
 *
 * The LLM never controls this machine: transitions are only performed by the
 * deterministic orchestrator. Each transition is validated against the graph.
 */
export const RECOVERY_TRANSITIONS: Record<RecoveryCaseStatus, readonly RecoveryCaseStatus[]> = {
  [RecoveryCaseStatus.OPEN]: [
    RecoveryCaseStatus.DIAGNOSING,
    RecoveryCaseStatus.SUPPRESSED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.DIAGNOSING]: [
    RecoveryCaseStatus.PLANNED,
    RecoveryCaseStatus.ACTION_REQUIRED,
    RecoveryCaseStatus.ESCALATED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.PLANNED]: [
    RecoveryCaseStatus.POLICY_CHECK,
    RecoveryCaseStatus.ESCALATED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.POLICY_CHECK]: [
    RecoveryCaseStatus.APPROVED,
    RecoveryCaseStatus.REJECTED,
  ],
  [RecoveryCaseStatus.APPROVED]: [
    RecoveryCaseStatus.SCHEDULED,
    RecoveryCaseStatus.REJECTED,
  ],
  [RecoveryCaseStatus.SCHEDULED]: [
    RecoveryCaseStatus.EXECUTING,
    RecoveryCaseStatus.SUPPRESSED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.REJECTED]: [
    RecoveryCaseStatus.ESCALATED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.WAITING]: [
    RecoveryCaseStatus.ACTION_REQUIRED,
    RecoveryCaseStatus.EXECUTING,
    RecoveryCaseStatus.SUPPRESSED,
  ],
  [RecoveryCaseStatus.ACTION_REQUIRED]: [
    RecoveryCaseStatus.PLANNED,
    RecoveryCaseStatus.EXECUTING,
    RecoveryCaseStatus.ESCALATED,
  ],
  [RecoveryCaseStatus.IN_PROGRESS]: [
    RecoveryCaseStatus.EXECUTING,
    RecoveryCaseStatus.OBSERVING,
  ],
  [RecoveryCaseStatus.EXECUTING]: [
    RecoveryCaseStatus.OBSERVING,
    RecoveryCaseStatus.ACTION_REQUIRED,
  ],
  [RecoveryCaseStatus.OBSERVING]: [
    RecoveryCaseStatus.RECOVERED,
    RecoveryCaseStatus.NOT_RECOVERED,
  ],
  [RecoveryCaseStatus.NOT_RECOVERED]: [
    RecoveryCaseStatus.PLANNED,
    RecoveryCaseStatus.ESCALATED,
    RecoveryCaseStatus.CLOSED,
  ],
  [RecoveryCaseStatus.RECOVERED]: [RecoveryCaseStatus.CLOSED],
  [RecoveryCaseStatus.ESCALATED]: [],
  [RecoveryCaseStatus.SUPPRESSED]: [],
  [RecoveryCaseStatus.CLOSED]: [],
};

/** Whether a state allows any further transitions (terminal). */
export function isTerminalState(status: RecoveryCaseStatus): boolean {
  return RECOVERY_TRANSITIONS[status].length === 0;
}

/** Validates (and returns) the target state, throwing on an illegal transition. */
export function assertValidTransition(
  from: RecoveryCaseStatus,
  to: RecoveryCaseStatus,
): RecoveryCaseStatus {
  if (!RECOVERY_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
  return to;
}