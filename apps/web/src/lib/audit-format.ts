import type { AuditAction, AuditEvent } from './platform-types';

/** Filter labels, in the order shown in the Activity tab. */
export const auditActionLabels: Record<AuditAction, string> = {
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'member.left': 'Member left',
  'ownership.transferred': 'Ownership transferred',
  'billing.plan_changed': 'Plan changed',
  'billing.plan_change_requested': 'Plan change requested',
  'billing.plan_change_cancelled': 'Plan change cancelled',
  'billing.plan_change_applied': 'Plan change approved',
  'billing.plan_change_rejected': 'Plan change rejected',
  'billing.invoice_issued': 'Invoice issued',
  'billing.invoice_paid': 'Invoice paid',
  'billing.invoice_voided': 'Invoice voided',
  'billing.suspended_for_nonpayment': 'Moved to Free for non-payment',
  'billing.plan_restored': 'Plan restored',
  'billing.profile_updated': 'Billing details updated',
  'billing.email_added': 'Billing email added',
  'billing.email_confirmed': 'Billing email confirmed',
  'billing.email_removed': 'Billing email removed',
  'invitation.created': 'Invitation sent',
  'invitation.resent': 'Invitation resent',
  'invitation.revoked': 'Invitation revoked',
  'invitation.accepted': 'Invitation accepted',
  'role.created': 'Role created',
  'role.updated': 'Role updated',
  'role.deleted': 'Role deleted',
  'api_key.created': 'API key created',
  'api_key.revoked': 'API key revoked',
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'organization.created': 'Workspace created',
};

const text = (value: unknown, fallback = 'unknown') =>
  typeof value === 'string' && value ? value : fallback;
const named = (value: unknown, fallback = 'a role') =>
  value && typeof value === 'object' && 'name' in value
    ? text((value as { name: unknown }).name, fallback)
    : fallback;
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

/** One plain sentence describing who did what. Metadata is untrusted input. */
export function describeAuditEvent(event: AuditEvent): string {
  // Scheduled billing jobs act as the system billing actor.
  const who =
    event.actor.email === 'billing-system@myanlex.invalid'
      ? 'MyanLex billing'
      : event.actor.email;
  const meta = event.metadata;
  const email = text(meta.email, 'someone');
  switch (event.action) {
    case 'organization.created':
      return `${who} created the workspace ${text(meta.name)}.`;
    case 'project.created':
      return `${who} created the project ${text(meta.name)}.`;
    case 'project.updated': {
      const fields = Object.keys(
        meta.changes && typeof meta.changes === 'object' ? meta.changes : {},
      );
      return `${who} updated the project ${text(meta.name)}${fields.length ? ` (${fields.join(', ')})` : ''}.`;
    }
    case 'api_key.created':
      return `${who} created the API key ${text(meta.name)} (${text(meta.prefix)}…).`;
    case 'api_key.revoked':
      return `${who} revoked the API key ${text(meta.name)} (${text(meta.prefix)}…).`;
    case 'member.role_changed':
      return `${who} changed ${email}'s role from ${named(meta.from)} to ${named(meta.to)}.`;
    case 'member.removed':
      return `${who} removed ${email} (${named(meta.role)}).`;
    case 'member.left':
      return `${who} left the workspace.`;
    case 'role.created':
      return `${who} created the role ${text(meta.name)}.`;
    case 'role.updated': {
      const added = list(meta.permissionsAdded);
      const removed = list(meta.permissionsRemoved);
      const parts = [
        added.length ? `added ${added.join(', ')}` : '',
        removed.length ? `removed ${removed.join(', ')}` : '',
      ].filter(Boolean);
      return `${who} updated the role ${text(meta.name)}${parts.length ? `: ${parts.join('; ')}` : ''}.`;
    }
    case 'role.deleted':
      return `${who} deleted the role ${text(meta.name)}.`;
    case 'invitation.created':
      return `${who} invited ${email} as ${named(meta.role)}.`;
    case 'invitation.resent':
      return `${who} resent the invitation to ${email}.`;
    case 'invitation.revoked':
      return `${who} revoked the invitation to ${email}.`;
    case 'invitation.accepted':
      return `${who} accepted an invitation and joined as ${named(meta.role)}.`;
    case 'ownership.transferred':
      return `${who} transferred ownership to ${email} and became ${named(meta.previousOwnerRole)}.`;
    case 'billing.plan_change_requested':
      return `${who} requested a move from ${text(meta.from, 'a plan')} to ${text(meta.to, 'a plan')}${meta.timing === 'next_month' ? ' from next month' : ''}.`;
    case 'billing.plan_change_cancelled':
      return `${who} cancelled the request to move to ${text(meta.to, 'a plan')}.`;
    case 'billing.plan_change_applied':
      return `${who} approved the move from ${text(meta.from, 'a plan')} to ${text(meta.to, 'a plan')}.`;
    case 'billing.plan_change_rejected':
      return `${who} rejected the move to ${text(meta.to, 'a plan')}.`;
    case 'billing.invoice_issued':
      return `${who} issued invoice ${text(meta.number)}.`;
    case 'billing.invoice_paid':
      return `${who} recorded payment of invoice ${text(meta.number)}.`;
    case 'billing.invoice_voided':
      return `${who} voided invoice ${text(meta.number)}.`;
    case 'billing.suspended_for_nonpayment':
      return `${who} moved the workspace from ${text(meta.plan, 'its plan')} to Free because invoice ${text(meta.number)} is overdue.`;
    case 'billing.plan_restored':
      return `${who} restored the ${text(meta.plan, 'previous')} plan after invoice ${text(meta.number)} was paid.`;
    case 'billing.profile_updated': {
      const labels: Record<string, string> = {
        legalName: 'legal name',
        address: 'address',
        taxId: 'tax ID',
        invoiceNote: 'invoice note',
      };
      const fields = list(meta.fields)
        .map((field) => labels[field])
        .filter(Boolean);
      return fields.length
        ? `${who} updated the billing details: ${fields.join(', ')}.`
        : `${who} updated the billing details.`;
    }
    case 'billing.email_added':
      return `${who} added ${text(meta.email, 'an address')} as a billing email.`;
    case 'billing.email_confirmed':
      return `${who} confirmed ${text(meta.email, 'an address')} as a billing email.`;
    case 'billing.email_removed':
      return `${who} removed ${text(meta.email, 'an address')} as a billing email.`;
    case 'billing.plan_changed':
      return `${who} changed the plan from ${text(meta.from, 'a plan')} to ${text(meta.to, 'a plan')}.`;
    default:
      return `${who} made a change (${String(event.action)}).`;
  }
}
