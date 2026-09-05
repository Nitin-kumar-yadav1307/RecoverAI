import { ActorType } from '../enums';

/**
 * Immutable audit record. See spec §35.
 * Every important event carries timestamp, actor, case, action, reason,
 * policy result, correlation id, and outcome.
 */
export class AuditEvent {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly actor_type: ActorType,
    public readonly actor_id: string,
    public readonly event_type: string,
    public readonly entity_type: string,
    public readonly entity_id: string,
    public readonly reason: string | null,
    public readonly input_json: Record<string, unknown> | null,
    public readonly decision_json: Record<string, unknown> | null,
    public readonly policy_json: Record<string, unknown> | null,
    public readonly outcome_json: Record<string, unknown> | null,
    public readonly correlation_id: string | null,
    public readonly created_at: Date,
  ) {}
}