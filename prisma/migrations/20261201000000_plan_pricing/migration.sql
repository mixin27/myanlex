-- Plan pricing: allowance + overage plans, per-plan currency, operator-assigned
-- subscriptions and priced monthly statements.
-- See docs/decisions/0024-plans-and-pricing.md.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- AlterTable
ALTER TABLE "plans"
    ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'MMK',
    ADD COLUMN "base_fee_minor" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "overage_mode" VARCHAR(16) NOT NULL DEFAULT 'block',
    ADD COLUMN "request_block" BIGINT NOT NULL DEFAULT 1000,
    ADD COLUMN "request_block_price_minor" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "character_block" BIGINT NOT NULL DEFAULT 100000,
    ADD COLUMN "character_block_price_minor" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "request_ceiling" BIGINT,
    ADD COLUMN "character_ceiling" BIGINT,
    ADD COLUMN "public" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "description" VARCHAR(500),
    ADD COLUMN "archived_at" TIMESTAMPTZ(3),
    ADD CONSTRAINT "plans_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "plans_overage_mode_check" CHECK ("overage_mode" IN ('block', 'allow')),
    ADD CONSTRAINT "plans_amounts_check" CHECK (
        "base_fee_minor" >= 0
        AND "request_block_price_minor" >= 0 AND "character_block_price_minor" >= 0
        AND "request_block" > 0 AND "character_block" > 0
        AND ("monthly_request_limit" IS NULL OR "monthly_request_limit" >= 0)
        AND ("monthly_character_limit" IS NULL OR "monthly_character_limit" >= 0)
    ),
    -- Ceilings only make sense for overage plans, and never sit below the allowance.
    ADD CONSTRAINT "plans_ceiling_check" CHECK (
        ("overage_mode" = 'allow' OR ("request_ceiling" IS NULL AND "character_ceiling" IS NULL))
        AND ("request_ceiling" IS NULL OR ("monthly_request_limit" IS NOT NULL
             AND "request_ceiling" >= "monthly_request_limit"))
        AND ("character_ceiling" IS NULL OR ("monthly_character_limit" IS NOT NULL
             AND "character_ceiling" >= "monthly_character_limit"))
    );

-- Free (and any plan created before pricing) is a zero-fee hard-limited plan:
-- the defaults above already describe it.

-- AlterTable
ALTER TABLE "subscriptions"
    ADD COLUMN "assigned_by" VARCHAR(320),
    ADD COLUMN "note" VARCHAR(500),
    ADD CONSTRAINT "subscriptions_period_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
    -- At most one active subscription covers any instant for an organization.
    ADD CONSTRAINT "subscriptions_no_overlap" EXCLUDE USING gist (
        "organization_id" WITH =,
        tstzrange("starts_at", "ends_at", '[)') WITH &&
    ) WHERE ("status" = 'active');

-- AlterTable (the immutability trigger covers UPDATE/DELETE, not DDL)
ALTER TABLE "usage_statements" ADD COLUMN "charges" JSONB;

-- Terms of a plan that a subscription has used are fixed: a new price is a new plan.
CREATE FUNCTION plans_terms_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD."monthly_request_limit", OLD."monthly_character_limit", OLD."currency",
        OLD."base_fee_minor", OLD."overage_mode", OLD."request_block",
        OLD."request_block_price_minor", OLD."character_block",
        OLD."character_block_price_minor", OLD."request_ceiling", OLD."character_ceiling",
        OLD."slug")
       IS DISTINCT FROM
       (NEW."monthly_request_limit", NEW."monthly_character_limit", NEW."currency",
        NEW."base_fee_minor", NEW."overage_mode", NEW."request_block",
        NEW."request_block_price_minor", NEW."character_block",
        NEW."character_block_price_minor", NEW."request_ceiling", NEW."character_ceiling",
        NEW."slug")
       AND EXISTS (SELECT 1 FROM "subscriptions" WHERE "plan_id" = OLD."id") THEN
        RAISE EXCEPTION 'plan % has subscriptions; its terms cannot change (create a new plan)', OLD."slug"
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER "plans_terms_immutable" BEFORE UPDATE ON "plans"
    FOR EACH ROW EXECUTE FUNCTION plans_terms_immutable();
