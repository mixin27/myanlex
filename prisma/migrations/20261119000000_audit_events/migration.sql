-- Administrative audit log: append-only, written in the same transaction as
-- each platform change. See docs/decisions/0022-audit-log-and-ownership-transfer.md.
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_email" VARCHAR(320) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_action_check" CHECK ("action" ~ '^[a-z_]+\.[a-z_]+$')
);

CREATE INDEX "audit_events_organization_id_created_at_id_idx" ON "audit_events"("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Records are never edited. The only UPDATE allowed is the foreign key's own
-- ON DELETE SET NULL when the acting user is deleted.
CREATE FUNCTION "audit_events_reject_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."actor_user_id" IS NULL AND OLD."actor_user_id" IS NOT NULL
       AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_events rows are append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "audit_events_no_update" BEFORE UPDATE ON "audit_events"
    FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_update"();

-- New catalog permission; system (Owner) roles always hold the full catalog.
INSERT INTO "permissions" ("id", "key", "description", "updated_at")
VALUES (gen_random_uuid(), 'audit.read', 'View the organization audit log.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."system" = true AND p."key" = 'audit.read'
ON CONFLICT DO NOTHING;
