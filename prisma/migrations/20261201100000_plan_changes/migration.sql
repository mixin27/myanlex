-- Plan changes: one row per requested change, whatever the channel (approval
-- now, checkout once a payment provider exists), applied through the same
-- assignment step as `pnpm billing:assign`.
-- See docs/decisions/0025-plan-changes.md.

-- AlterTable (descriptive, so the plans_terms_immutable trigger ignores it)
ALTER TABLE "plans"
    ADD COLUMN "change_policy" VARCHAR(16) NOT NULL DEFAULT 'approval',
    ADD CONSTRAINT "plans_change_policy_check" CHECK ("change_policy" IN ('approval', 'self_service'));

-- CreateTable
CREATE TABLE "plan_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_plan_slug" VARCHAR(80) NOT NULL,
    "plan_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "timing" VARCHAR(16) NOT NULL,
    "requested_starts_at" TIMESTAMPTZ(3),
    "note" VARCHAR(500),
    "requester_user_id" UUID,
    "requester_email" VARCHAR(320) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" VARCHAR(320),
    "decision_note" VARCHAR(500),
    "subscription_id" UUID,
    "external_ref" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_changes_channel_check" CHECK ("channel" IN ('approval', 'checkout')),
    CONSTRAINT "plan_changes_timing_check" CHECK (
        ("timing" = 'now' AND "requested_starts_at" IS NULL)
        OR ("timing" = 'next_month' AND "requested_starts_at" IS NOT NULL)
    ),
    -- Approval changes wait in `pending`; checkout changes in `awaiting_payment`
    -- (reserved) and may `expire` when abandoned.
    CONSTRAINT "plan_changes_status_check" CHECK (
        ("channel" = 'approval' AND "status" IN ('pending', 'applied', 'rejected', 'cancelled'))
        OR ("channel" = 'checkout' AND "status" IN ('awaiting_payment', 'applied', 'cancelled', 'expired'))
    ),
    CONSTRAINT "plan_changes_decided_check" CHECK (
        ("status" IN ('pending', 'awaiting_payment')) = ("decided_at" IS NULL)
    )
);

-- At most one open change per organization.
CREATE UNIQUE INDEX "plan_changes_one_open" ON "plan_changes"("organization_id")
    WHERE "status" IN ('pending', 'awaiting_payment');

-- CreateIndex
CREATE INDEX "plan_changes_organization_id_created_at_idx" ON "plan_changes"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "plan_changes_plan_id_idx" ON "plan_changes"("plan_id");

-- CreateIndex
CREATE INDEX "plan_changes_requester_user_id_idx" ON "plan_changes"("requester_user_id");

-- CreateIndex
CREATE INDEX "plan_changes_subscription_id_idx" ON "plan_changes"("subscription_id");

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
