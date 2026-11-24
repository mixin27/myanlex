-- Usage alerts: each threshold is recorded once per workspace and month, then
-- emailed to the billing contacts. See docs/platform.md#usage-alerts.

-- CreateTable
CREATE TABLE "usage_alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "month_start" TIMESTAMPTZ(3) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "dimension" VARCHAR(16) NOT NULL,
    "used" BIGINT NOT NULL,
    "threshold_value" BIGINT NOT NULL,
    "limit_value" BIGINT NOT NULL,
    "plan_slug" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_alerts_kind_check" CHECK ("kind" IN ('allowance_80', 'allowance_100', 'ceiling_90')),
    CONSTRAINT "usage_alerts_dimension_check" CHECK ("dimension" IN ('requests', 'characters')),
    CONSTRAINT "usage_alerts_values_check" CHECK ("used" >= 0 AND "threshold_value" > 0 AND "limit_value" > 0 AND "attempts" >= 0)
);

CREATE UNIQUE INDEX "usage_alerts_organization_id_month_start_kind_key" ON "usage_alerts"("organization_id", "month_start", "kind");
-- Unsent alerts are retried by the scan.
CREATE INDEX "usage_alerts_unsent_idx" ON "usage_alerts"("month_start") WHERE "sent_at" IS NULL;

ALTER TABLE "usage_alerts" ADD CONSTRAINT "usage_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
