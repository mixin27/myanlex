// Permission keys are application capabilities. Roles remain database records.
export const permissionCatalog = [
  ['api.invoke', 'Call MyanLex language-processing operations.'],
  ['project.read', 'View projects in an organization.'],
  ['project.create', 'Create projects in an organization.'],
  ['project.update', 'Update projects in an organization.'],
  ['project.delete', 'Delete projects in an organization.'],
  ['api_key.read', 'View API-key metadata.'],
  ['api_key.create', 'Create API keys.'],
  ['api_key.revoke', 'Revoke API keys.'],
  ['usage.read', 'View project usage and aggregates.'],
  ['role.read', 'View roles and their permissions.'],
  ['role.manage', 'Create and change roles and permissions.'],
  ['member.read', 'View organization members.'],
  ['member.manage', 'Invite, update, and remove organization members.'],
  ['billing.read', 'View plan and subscription details.'],
  ['billing.manage', 'Change plan and subscription settings.'],
] as const;
