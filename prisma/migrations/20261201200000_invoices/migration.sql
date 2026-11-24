-- Invoices and payments: prepaid base fees, overage in arrears, prorated
-- mid-month upgrades, settled by any payment method.
-- See docs/decisions/0026-invoices-and-payments.md.

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("year"),
    CONSTRAINT "invoice_sequences_check" CHECK ("last_number" >= 0)
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" VARCHAR(500),
    "plan_change_id" UUID,
    "restores_plan_slug" VARCHAR(80),
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_kind_check" CHECK ("kind" IN ('monthly', 'proration')),
    CONSTRAINT "invoices_number_check" CHECK ("number" ~ '^MLX-[0-9]{4}-[0-9]{6}$'),
    CONSTRAINT "invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "invoices_amounts_check" CHECK (
        "subtotal_minor" >= 0 AND "total_minor" = "subtotal_minor"
    ),
    CONSTRAINT "invoices_period_check" CHECK ("period_end" > "period_start" AND "due_at" >= "issued_at"),
    CONSTRAINT "invoices_status_check" CHECK (
        ("status" = 'open' AND "paid_at" IS NULL AND "voided_at" IS NULL)
        OR ("status" = 'paid' AND "paid_at" IS NOT NULL AND "voided_at" IS NULL)
        OR ("status" = 'void' AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL AND "paid_at" IS NULL)
    ),
    CONSTRAINT "invoices_reminders_check" CHECK ("reminders_sent" BETWEEN 0 AND 3)
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" BIGINT NOT NULL,
    "unit_minor" BIGINT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "plan_slug" VARCHAR(80) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_lines_kind_check" CHECK (
        "kind" IN ('base_fee', 'proration', 'request_overage', 'character_overage')
    ),
    CONSTRAINT "invoice_lines_amounts_check" CHECK (
        "quantity" >= 0 AND "unit_minor" >= 0 AND "amount_minor" >= 0
    )
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(32),
    "external_ref" VARCHAR(200),
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by" VARCHAR(320) NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_method_check" CHECK (
        ("method" IN ('bank_transfer', 'cash') AND "provider" IS NULL)
        OR ("method" = 'provider' AND "provider" IS NOT NULL AND "external_ref" IS NOT NULL)
    ),
    CONSTRAINT "payments_amount_check" CHECK ("amount_minor" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_organization_id_issued_at_idx" ON "invoices"("organization_id", "issued_at" DESC);
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");
CREATE INDEX "invoices_plan_change_id_idx" ON "invoices"("plan_change_id");
-- Monthly invoicing is idempotent: one monthly invoice per organization, month
-- and currency (two only in the month a workspace changes currency).
CREATE UNIQUE INDEX "invoices_one_monthly" ON "invoices"("organization_id", "period_start", "currency") WHERE "kind" = 'monthly';
CREATE UNIQUE INDEX "invoice_lines_invoice_id_position_key" ON "invoice_lines"("invoice_id", "position");
CREATE UNIQUE INDEX "payments_provider_external_ref_key" ON "payments"("provider", "external_ref");
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_change_id_fkey" FOREIGN KEY ("plan_change_id") REFERENCES "plan_changes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An issued invoice keeps its identity, period and amounts. Only an open
-- invoice changes, and only to record reminders, dunning, payment or voiding.
-- Rows go away only with their organization.
CREATE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
        OLD."plan_change_id")
       IS DISTINCT FROM
       (NEW."number", NEW."organization_id", NEW."kind", NEW."period_start", NEW."period_end",
        NEW."currency", NEW."subtotal_minor", NEW."total_minor", NEW."issued_at", NEW."due_at",
        NEW."plan_change_id") THEN
        RAISE EXCEPTION 'an issued invoice cannot change'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD."status" <> 'open' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'invoice % is % and cannot change', OLD."number", OLD."status"
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER "invoices_guard" BEFORE UPDATE OR DELETE ON "invoices"
    FOR EACH ROW EXECUTE FUNCTION invoices_guard();

-- Lines and payments are append-only; they go away only with their organization.
CREATE FUNCTION invoice_children_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM "invoices" i JOIN "organizations" o ON o."id" = i."organization_id"
        WHERE i."id" = OLD."invoice_id"
    ) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION '% rows cannot be changed or deleted', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER "invoice_lines_guard" BEFORE UPDATE OR DELETE ON "invoice_lines"
    FOR EACH ROW EXECUTE FUNCTION invoice_children_guard();
CREATE TRIGGER "payments_guard" BEFORE UPDATE OR DELETE ON "payments"
    FOR EACH ROW EXECUTE FUNCTION invoice_children_guard();

-- At commit, an invoice's lines add up to its subtotal, so lines can't be
-- added to an invoice after it was issued.
CREATE FUNCTION invoice_lines_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target UUID := (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'invoices' THEN 'id' ELSE 'invoice_id' END)::uuid;
BEGIN
    IF EXISTS (
        SELECT 1 FROM "invoices" i
        WHERE i."id" = target
          AND i."subtotal_minor" <> COALESCE(
              (SELECT sum(l."amount_minor") FROM "invoice_lines" l WHERE l."invoice_id" = i."id"), 0)
    ) THEN
        RAISE EXCEPTION 'invoice lines do not add up to the invoice subtotal'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "invoices_balance" AFTER INSERT ON "invoices"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_lines_balance();
CREATE CONSTRAINT TRIGGER "invoice_lines_balance" AFTER INSERT ON "invoice_lines"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_lines_balance();
