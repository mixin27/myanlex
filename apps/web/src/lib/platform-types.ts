export interface Organization {
  id: string;
  name: string;
  slug: string;
}
export interface OrganizationAccess extends Organization {
  permissions: string[];
}
export interface Project extends Organization {
  organizationId: string;
  environment: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}
export interface UsageMetrics {
  requestCount: string;
  errorCount: string;
  charactersProcessed: string;
  processingTimeMs: string;
  averageProcessingTimeMs: string | null;
}
export interface UsageReport {
  sources?: { api_key: UsageMetrics; playground: UsageMetrics };
  projectId: string;
  from: string;
  to: string;
  timezone: 'UTC';
  generatedAt: string;
  metering: 'best-effort';
  totals: UsageMetrics;
  days: (UsageMetrics & { date: string })[];
}

export interface QuotaDimension {
  used: string;
  /** Monthly allowance included in the plan. */
  limit: string | null;
  remaining: string | null;
  /** Where admission stops: the allowance, or an overage plan's ceiling. */
  ceiling: string | null;
  /** Usage above the allowance (billed on overage plans). */
  overage: string;
}
export interface QuotaReport {
  organizationId: string;
  enforcementEnabled: boolean;
  timezone: 'UTC';
  generatedAt: string;
  periodStart: string;
  resetsAt: string;
  metering: 'admission-reservations';
  plan: {
    name: string;
    slug: string;
    source: 'subscription' | 'free';
    overageMode: OverageMode;
  };
  requests: QuotaDimension;
  characters: QuotaDimension;
}

export type OverageMode = 'block' | 'allow';
/** Plan terms; amounts are integer strings in the currency's minor units. */
export interface PlanTerms {
  name: string;
  slug: string;
  monthlyRequestLimit: string | null;
  monthlyCharacterLimit: string | null;
  currency: string;
  baseFeeMinor: string;
  overageMode: OverageMode;
  requestBlock: string;
  requestBlockPriceMinor: string;
  characterBlock: string;
  characterBlockPriceMinor: string;
  requestCeiling: string | null;
  characterCeiling: string | null;
}
export interface OverageLine {
  units: string;
  blocks: string;
  blockSize: string;
  blockPriceMinor: string;
  amountMinor: string;
}
export interface Charges {
  currency: string;
  baseFeeMinor: string;
  requests: OverageLine;
  characters: OverageLine;
  totalMinor: string;
  /** True while the month is open. */
  estimated: boolean;
}
export interface BillingOverview {
  organizationId: string;
  generatedAt: string;
  plan: PlanTerms & {
    source: 'subscription' | 'free';
    description: string | null;
  };
  currentMonth: {
    month: string;
    timezone: 'UTC';
    totals: { requests: string; characters: string };
    charges: Charges;
  };
  subscriptions: {
    id: string;
    plan: { name: string; slug: string };
    startsAt: string;
    endsAt: string | null;
    status: 'current' | 'scheduled' | 'ended';
    note: string | null;
  }[];
  publicPlans: (PlanTerms & {
    description: string | null;
    changePolicy: 'approval' | 'self_service';
    change: ChangePreview;
  })[];
  freeChange: ChangePreview;
  /** Open invoices per currency. */
  outstanding: {
    currency: string;
    totalMinor: string;
    invoices: number;
    oldestDueAt: string;
    overdue: boolean;
  }[];
  /** Set when an overdue invoice moved the workspace to Free. */
  suspended: { invoiceNumber: string; plan: string } | null;
  paymentInstructions: string | null;
  /** Latest plan changes, newest first. */
  changes: PlanChange[];
  openChange: PlanChange | null;
  /** Whether the viewer holds billing.manage. */
  canRequestChange: boolean;
  profile: BillingProfile;
  /** Usage thresholds crossed this month, oldest first. */
  usageAlerts: UsageAlert[];
}

export interface UsageAlert {
  kind: 'allowance_80' | 'allowance_100' | 'ceiling_90';
  dimension: 'requests' | 'characters';
  used: string;
  /** The allowance or ceiling the percentage refers to. */
  limit: string;
  createdAt: string;
}

export interface BillingEmail {
  id: string;
  email: string;
  status: 'confirmed' | 'pending' | 'expired';
  /** When the address was added or its confirmation link last sent. */
  sentAt: string;
  confirmedAt: string | null;
}

/** Bill-to details printed on invoices issued after a change. */
export interface BillingDetails {
  legalName: string | null;
  address: string | null;
  taxId: string | null;
  invoiceNote: string | null;
}

export interface BillingProfile extends BillingDetails {
  emails: BillingEmail[];
}

/** The bill-to details as they were when an invoice was issued. */
export interface BillTo {
  name: string;
  address: string | null;
  taxId: string | null;
  note: string | null;
}

export type PlanChangeStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'applied'
  | 'rejected'
  | 'cancelled'
  | 'expired';
/** A requested plan change (ADR 0025). */
export interface PlanChange {
  id: string;
  channel: 'approval' | 'checkout';
  status: PlanChangeStatus;
  fromPlanSlug: string;
  plan: { name: string; slug: string };
  timing: 'now' | 'next_month';
  requestedStartsAt: string | null;
  note: string | null;
  requesterEmail: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface UsageStatementLine {
  projectId: string;
  projectName: string;
  source: 'api_key' | 'playground';
  apiKey: { id: string; name: string | null; prefix: string | null } | null;
  requests: string;
  characters: string;
}
/** Billable monthly totals from the usage ledger (admitted requests). */
export interface UsageStatement {
  organizationId: string;
  month: string;
  timezone: 'UTC';
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'closed';
  billableUnit: 'admitted-request';
  generatedAt: string;
  closedAt: string | null;
  totals: { requests: string; characters: string; events: string };
  counter: { requests: string; characters: string };
  reconciled: boolean;
  /** Statements closed before plan pricing hold only the first four fields. */
  plan: Pick<
    PlanTerms,
    'name' | 'slug' | 'monthlyRequestLimit' | 'monthlyCharacterLimit'
  > &
    Partial<PlanTerms>;
  /** Null for months closed before plan pricing. */
  charges: Charges | null;
  lines: UsageStatementLine[];
  ledgerAvailable: boolean;
}

export interface RoleReference {
  id: string;
  name: string;
  slug: string;
}
export interface Role extends RoleReference {
  description: string | null;
  system: boolean;
  permissions: string[];
  memberCount: number;
  invitationCount: number;
}
export interface Permission {
  key: string;
  description: string;
}
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: RoleReference;
  permissions: string[];
  joinedAt: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: RoleReference;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
  createdAt: string;
}
export interface SentInvitation extends Invitation {
  emailDelivery: 'sent' | 'failed' | 'disabled';
}
export interface PendingInvitation {
  id: string;
  organization: Organization;
  role: RoleReference;
  expiresAt: string;
  createdAt: string;
}
export interface AcceptedInvitation {
  status: 'accepted' | 'already_member';
  organization: Organization;
}
export type AuditAction =
  | 'organization.created'
  | 'project.created'
  | 'project.updated'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'member.role_changed'
  | 'member.removed'
  | 'member.left'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'invitation.created'
  | 'invitation.resent'
  | 'invitation.revoked'
  | 'invitation.accepted'
  | 'ownership.transferred'
  | 'billing.plan_changed'
  | 'billing.plan_change_requested'
  | 'billing.plan_change_cancelled'
  | 'billing.plan_change_applied'
  | 'billing.plan_change_rejected'
  | 'billing.invoice_issued'
  | 'billing.invoice_paid'
  | 'billing.invoice_voided'
  | 'billing.suspended_for_nonpayment'
  | 'billing.plan_restored'
  | 'billing.profile_updated'
  | 'billing.email_added'
  | 'billing.email_confirmed'
  | 'billing.email_removed';
export interface AuditEvent {
  id: string;
  action: AuditAction;
  actor: { userId: string | null; email: string };
  target: { type: string; id: string };
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}
export interface AuditEventPage {
  items: AuditEvent[];
  nextCursor: string | null;
}
export interface OwnershipTransfer {
  owner: Member;
  previousOwner: Member;
}

/** How moving to a plan would be billed (ADR 0026). */
export interface ChangePreview {
  kind: 'upgrade' | 'downgrade' | 'currency';
  nowAllowed: boolean;
  prorationMinor: string | null;
  currency: string;
}

export interface Invoice {
  number: string;
  /** Null on invoices issued before billing details existed. */
  billTo: BillTo | null;
  kind: 'monthly' | 'proration';
  status: 'open' | 'paid' | 'void';
  periodStart: string;
  periodEnd: string;
  currency: string;
  subtotalMinor: string;
  totalMinor: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  overdue: boolean;
  suspended: boolean;
  lines: {
    kind: string;
    description: string;
    quantity: string;
    unitMinor: string;
    amountMinor: string;
  }[];
  payments: {
    method: string;
    provider: string | null;
    amountMinor: string;
    receivedAt: string;
  }[];
}
export interface InvoicePage {
  items: Invoice[];
  nextCursor: string | null;
}
