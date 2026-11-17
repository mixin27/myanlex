-- Team management: system roles and organization invitations.
ALTER TABLE "roles" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false;
-- Every organization's creator role was created as slug "owner".
UPDATE "roles" SET "system" = true WHERE "slug" = 'owner';

CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_invitations_email_lowercase_check" CHECK ("email" = lower("email")),
    CONSTRAINT "organization_invitations_closed_check" CHECK ("accepted_at" IS NULL OR "revoked_at" IS NULL)
);

CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");
CREATE INDEX "organization_invitations_organization_id_id_idx" ON "organization_invitations"("organization_id", "id");
CREATE INDEX "organization_invitations_email_expires_at_idx" ON "organization_invitations"("email", "expires_at");
CREATE INDEX "organization_invitations_role_id_organization_id_idx" ON "organization_invitations"("role_id", "organization_id");
-- At most one open (unaccepted, unrevoked) invitation per organization and email.
CREATE UNIQUE INDEX "organization_invitations_open_email_key" ON "organization_invitations"("organization_id", "email")
    WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "roles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
