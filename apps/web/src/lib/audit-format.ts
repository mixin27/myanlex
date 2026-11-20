import type { AuditAction, AuditEvent } from './platform-types';

/** Filter labels, in the order shown in the Activity tab. */
export const auditActionLabels: Record<AuditAction, string> = {
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'member.left': 'Member left',
  'ownership.transferred': 'Ownership transferred',
  'billing.plan_changed': 'Plan changed',
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
  const who = event.actor.email;
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
    case 'billing.plan_changed':
      return `${who} changed the plan from ${named(meta.from, 'a plan')} to ${named(meta.to, 'a plan')}.`;
    default:
      return `${who} made a change (${String(event.action)}).`;
  }
}
