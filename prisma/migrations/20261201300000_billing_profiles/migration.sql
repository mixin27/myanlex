-- Billing details: bill-to fields printed on invoices and confirmed billing
-- email addresses that receive invoice mail. Issued invoices keep a snapshot
-- of the bill-to details. See docs/decisions/0026-invoices-and-payments.md.

-- CreateTable
CREATE TABLE "billing_profiles" (
    "organization_id" UUID NOT NULL,
    "legal_name" VARCHAR(200),
    "address" VARCHAR(500),
    "tax_id" VARCHAR(64),
    "invoice_note" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" UUID,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "billing_profiles_not_blank_check" CHECK (
        btrim(COALESCE("legal_name", 'x')) <> '' AND btrim(COALESCE("address", 'x')) <> ''
        AND btrim(COALESCE("tax_id", 'x')) <> '' AND btrim(COALESCE("invoice_note", 'x')) <> ''
    )
);

-- CreateTable
CREATE TABLE "billing_emails" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" CHAR(64),
    "token_expires_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID,

    CONSTRAINT "billing_emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_emails_lower_check" CHECK ("email" = lower("email")),
    -- Pending addresses carry a token; confirmed ones never do.
    CONSTRAINT "billing_emails_state_check" CHECK (
        ("verified_at" IS NULL AND "token_hash" IS NOT NULL AND "token_expires_at" IS NOT NULL)
        OR ("verified_at" IS NOT NULL AND "token_hash" IS NULL)
    )
);

CREATE UNIQUE INDEX "billing_emails_organization_id_email_key" ON "billing_emails"("organization_id", "email");
CREATE UNIQUE INDEX "billing_emails_token_hash_key" ON "billing_emails"("token_hash");

ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_emails" ADD CONSTRAINT "billing_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_emails" ADD CONSTRAINT "billing_emails_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Issued invoices keep the bill-to details in effect when they were issued.
ALTER TABLE "invoices" ADD COLUMN "bill_to" JSONB;

CREATE OR REPLACE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM "organizations" WHERE "id" = OLD."organization_id") THEN
            RAISE EXCEPTION 'invoices are kept; void an invoice instead of deleting it'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN OLD;
    END IF;
    IF (OLD."number", OLD."organization_id", OLD."kind", OLD."period_start", OLD."period_end",
        OLD."currency", OLD."subtotal_minor", OLD."total_minor", OLD."issued_at", OLD."due_at",
        OLD."plan_change_id", OLD."bill_to")
       IS DISTINCT FROM
       (NEW."number", NEW."organization_id", NEW."kind", NEW."period_start", NEW."period_end",
        NEW."currency", NEW."subtotal_minor", NEW."total_minor", NEW."issued_at", NEW."due_at",
        NEW."plan_change_id", NEW."bill_to") THEN
        RAISE EXCEPTION 'an issued invoice cannot change'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD."status" <> 'open' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'invoice % is % and cannot change', OLD."number", OLD."status"
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;
