import { ActionStatus, RecoveryActionType } from '../enums';
import { PolicyDecision } from '../enums';

export type PolicySnapshot = {
  decision: PolicyDecision;
  reasons: string[];
  constraints: Record<string, unknown>;
};

export class RecoveryAction {
  constructor(
    public readonly id: string,
    public readonly recovery_case_id: string,
    public readonly type: RecoveryActionType,
    public readonly status: ActionStatus,
    public readonly reason: string | null,
    public readonly parameters_json: Record<string, unknown>,
    public readonly policy_decision: PolicySnapshot | null,
    public readonly scheduled_at: Date | null,
    public readonly executed_at: Date | null,
    public readonly result_json: Record<string, unknown> | null,
    public readonly createdAt: Date,
  ) {}
}