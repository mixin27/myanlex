CREATE TABLE "organization_quotas" (
    "organization_id" UUID NOT NULL,
    "month_start" TIMESTAMPTZ(3) NOT NULL,
    "request_count" BIGINT NOT NULL DEFAULT 0,
    "character_count" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_quotas_pkey" PRIMARY KEY ("organization_id", "month_start"),
    CONSTRAINT "organization_quotas_nonnegative" CHECK ("request_count" >= 0 AND "character_count" >= 0),
    CONSTRAINT "organization_quotas_month_start" CHECK ("month_start" = date_trunc('month', "month_start" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
    CONSTRAINT "organization_quotas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
