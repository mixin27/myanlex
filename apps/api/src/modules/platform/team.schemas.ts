import { z } from 'zod';
import { permissionCatalog } from './permission-catalog.js';

const permissionKeys = permissionCatalog.map(([key]) => key) as [
  (typeof permissionCatalog)[number][0],
  ...(typeof permissionCatalog)[number][0][],
];
const roleName = z.string().trim().min(1).max(80);
const roleSlug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  // Reserved for the system role created with every organization.
  .refine((slug) => slug !== 'owner', 'The owner slug is reserved.');
const roleDescription = z.string().trim().max(500).nullable();
const permissions = z
  .array(z.enum(permissionKeys))
  .max(permissionKeys.length)
  .transform((keys) => [...new Set(keys)].sort());

export const roleInput = z
  .object({
    name: roleName,
    slug: roleSlug,
    description: roleDescription.optional().default(null),
    permissions,
  })
  .strict();
export const roleUpdateInput = z
  .object({
    name: roleName,
    slug: roleSlug,
    description: roleDescription,
    permissions,
  })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one role field is required.',
  );
export const memberUpdateInput = z.object({ roleId: z.uuid() }).strict();
export const ownershipTransferInput = z
  .object({
    toUserId: z.uuid(),
    newRoleId: z.uuid(),
    // Typed confirmation: the organization's slug, exactly.
    confirmSlug: z.string().min(1).max(80),
  })
  .strict();
export const invitationInput = z
  .object({
    email: z
      .email()
      .max(320)
      .transform((email) => email.toLowerCase()),
    roleId: z.uuid(),
  })
  .strict();
export const invitationAcceptInput = z.union([
  z
    .object({
      token: z
        .string()
        .min(32)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/),
    })
    .strict(),
  z.object({ invitationId: z.uuid() }).strict(),
]);

export type RoleInput = z.infer<typeof roleInput>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInput>;
export type MemberUpdateInput = z.infer<typeof memberUpdateInput>;
export type InvitationInput = z.infer<typeof invitationInput>;
export type InvitationAcceptInput = z.infer<typeof invitationAcceptInput>;
export type OwnershipTransferInput = z.infer<typeof ownershipTransferInput>;
