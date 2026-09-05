import {
  AssignmentMode,
  FailureCategory,
  Priority,
  RecoveryCaseStatus,
} from '../enums';
import { Money } from '../money';
import { assertValidTransition, isTerminalState } from '../state-machine';

export class RecoveryCase {
  public readonly id: string;
  public readonly merchant_id: string;
  public readonly customer_id: string;
  public readonly payment_id: string;
  public status: RecoveryCaseStatus;
  public readonly risk_amount: Money;
  public readonly failure_category: FailureCategory;
  public readonly priority: Priority;
  public current_strategy: string | null;
  public next_action_at: Date | null;
  public readonly assigned_mode: AssignmentMode;
  public readonly created_at: Date;
  public updated_at: Date;
  public closed_at: Date | null;

  constructor(props: {
    id: string;
    merchant_id: string;
    customer_id: string;
    payment_id: string;
    status: RecoveryCaseStatus;
    risk_amount: Money;
    failure_category: FailureCategory;
    priority: Priority;
    current_strategy?: string | null;
    next_action_at?: Date | null;
    assigned_mode: AssignmentMode;
    created_at?: Date;
    updated_at?: Date;
    closed_at?: Date | null;
  }) {
    this.id = props.id;
    this.merchant_id = props.merchant_id;
    this.customer_id = props.customer_id;
    this.payment_id = props.payment_id;
    this.status = props.status;
    this.risk_amount = props.risk_amount;
    this.failure_category = props.failure_category;
    this.priority = props.priority;
    this.current_strategy = props.current_strategy ?? null;
    this.next_action_at = props.next_action_at ?? null;
    this.assigned_mode = props.assigned_mode;
    this.created_at = props.created_at ?? new Date();
    this.updated_at = props.updated_at ?? new Date();
    this.closed_at = props.closed_at ?? null;
  }

  /** Transition guarded by the deterministic state machine; updates timestamps. */
  transition(to: RecoveryCaseStatus, now: Date = new Date()): void {
    assertValidTransition(this.status, to);
    this.status = to;
    this.updated_at = now;
    if (this.isClosed()) this.closed_at = now;
  }

  isClosed(): boolean {
    return isTerminalState(this.status);
  }
}