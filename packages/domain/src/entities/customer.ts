import { CustomerStatus } from '../enums';

/** A merchant's customer. Never stores raw card or unnecessary sensitive data. */
export class Customer {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly external_customer_id: string,
    public readonly name: string,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly status: CustomerStatus,
    public readonly timezone: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}