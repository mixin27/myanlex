-- Billing-grade usage metering: an append-only ledger written in the same
-- transaction as the quota counter, plus immutable monthly statements.
-- See docs/decisions/0023-billing-grade-usage-metering.md.

-- DropForeignKey
ALTER TABLE "daily_usage" DROP CONSTRAINT "daily_usage_project_id_fkey";

-- AlterTable
ALTER TABLE "api_usage" ADD COLUMN     "usage_event_id" UUID;

-- DropTable
DROP TABLE "daily_usage";

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "api_key_id" UUID,
    "source" VARCHAR(24) NOT NULL,
    "month_start" TIMESTAMPTZ(3) NOT NULL,
    "request_units" INTEGER NOT NULL DEFAULT 1,
    "characters" BIGINT NOT NULL,
    "endpoint" VARCHAR(160) NOT NULL,
    "request_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_events_source_check" CHECK (
        ("source" = 'api_key' AND "api_key_id" IS NOT NULL)
        OR ("source" = 'playground' AND "api_key_id" IS NULL)
    ),
    CONSTRAINT "usage_events_units_check" CHECK ("request_units" > 0 AND "characters" >= 0)
);

-- CreateTable
CREATE TABLE "usage_statements" (
    "organization_id" UUID NOT NULL,
    "month_start" TIMESTAMPTZ(3) NOT NULL,
    "request_count" BIGINT NOT NULL,
    "character_count" BIGINT NOT NULL,
    "event_count" BIGINT NOT NULL,
    "counter_requests" BIGINT NOT NULL,
    "counter_characters" BIGINT NOT NULL,
    "reconciled" BOOLEAN NOT NULL,
    "plan" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_statements_pkey" PRIMARY KEY ("organization_id","month_start")
);

-- CreateIndex
CREATE INDEX "usage_events_organization_id_month_start_created_at_id_idx" ON "usage_events"("organization_id", "month_start", "created_at", "id");

-- CreateIndex
CREATE INDEX "usage_events_organization_id_month_start_project_id_api_key_idx" ON "usage_events"("organization_id", "month_start", "project_id", "api_key_id");

-- CreateIndex
CREATE INDEX "usage_events_month_start_idx" ON "usage_events"("month_start");

-- CreateIndex
CREATE INDEX "usage_events_project_id_idx" ON "usage_events"("project_id");

-- CreateIndex
CREATE INDEX "usage_events_api_key_id_idx" ON "usage_events"("api_key_id");

-- CreateIndex
CREATE INDEX "usage_statements_month_start_idx" ON "usage_statements"("month_start");

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_statements" ADD CONSTRAINT "usage_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ledger rows are never edited. Retention cleanup may delete closed months.
CREATE FUNCTION "usage_events_reject_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'usage_events rows are append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "usage_events_no_update" BEFORE UPDATE ON "usage_events"
    FOR EACH ROW EXECUTE FUNCTION "usage_events_reject_update"();

-- Closed statements are never edited or deleted, except when their
-- organization itself is deleted (the foreign key's ON DELETE CASCADE).
CREATE FUNCTION "usage_statements_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM "organizations" WHERE "id" = OLD."organization_id"
    ) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'usage_statements rows are immutable' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "usage_statements_immutable" BEFORE UPDATE OR DELETE ON "usage_statements"
    FOR EACH ROW EXECUTE FUNCTION "usage_statements_reject_change"();
