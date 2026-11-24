import type { AuditActor } from './audit.js';

/**
 * Billing details (ADR 0026, "Billing details"): bill-to fields printed on
 * invoices issued after a change, and up to three billing email addresses.
 * Invoice mail goes to confirmed billing emails when a workspace has any,
 * otherwise to members who can manage billing.
 */

export const BILLING_PROFILE_REPOSITORY = Symbol('BILLING_PROFILE_REPOSITORY');

export const MAX_BILLING_EMAILS = 3;
/** Confirmation links last a week, like invitations. */
export const BILLING_EMAIL_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;
/** A confirmation email can be re-sent once a minute per address. */
export const BILLING_EMAIL_RESEND_MS = 60 * 1000;

export interface BillingDetails {
  readonly legalName: string | null;
  readonly address: string | null;
  readonly taxId: string | null;
  readonly invoiceNote: string | null;
}

export type BillingEmailStatus = 'confirmed' | 'pending' | 'expired';

export interface BillingEmailRecord {
  readonly id: string;
  readonly email: string;
  readonly status: BillingEmailStatus;
  /** When the address was added or the link last sent. */
  readonly sentAt: Date;
  readonly verifiedAt: Date | null;
}

export interface BillingProfileRecord {
  readonly details: BillingDetails;
  readonly emails: readonly BillingEmailRecord[];
}

/** A newly created or refreshed confirmation link; the token is never stored. */
export interface PendingBillingEmail {
  readonly email: BillingEmailRecord;
  readonly token: string;
  readonly organizationName: string;
}

export type BillingProfileErrorCode =
  | 'duplicate_email'
  | 'email_limit'
  | 'not_found'
  | 'already_confirmed'
  | 'too_soon'
  | 'invalid_or_expired';

export class BillingProfileError extends Error {
  constructor(
    readonly code: BillingProfileErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface BillingProfileRepository {
  profile(organizationId: string): Promise<BillingProfileRecord>;
  updateDetails(
    organizationId: string,
    actor: AuditActor,
    details: BillingDetails,
  ): Promise<BillingProfileRecord>;
  addEmail(
    organizationId: string,
    actor: AuditActor,
    email: string,
  ): Promise<PendingBillingEmail>;
  resendEmail(
    organizationId: string,
    emailId: string,
  ): Promise<PendingBillingEmail>;
  removeEmail(
    organizationId: string,
    actor: AuditActor,
    emailId: string,
  ): Promise<void>;
  /** Confirms by link token. A used or expired token is refused. */
  confirmEmail(
    token: string,
  ): Promise<{ readonly organizationName: string; readonly email: string }>;
}

/** The bill-to snapshot stored on each issued invoice. */
export interface BillTo {
  readonly name: string;
  readonly address: string | null;
  readonly taxId: string | null;
  readonly note: string | null;
}

export function readBillTo(value: unknown, fallbackName: string): BillTo {
  const object =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof object[key] === 'string' && object[key] ? object[key] : null;
  return {
    name: text('name') ?? fallbackName,
    address: text('address'),
    taxId: text('taxId'),
    note: text('note'),
  };
}
