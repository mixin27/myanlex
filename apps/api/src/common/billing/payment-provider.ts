/**
 * A payment provider adapter (ADR 0026). Nothing implements this yet: invoices
 * are settled by operators (`pnpm billing:invoices mark-paid`) until a
 * provider is chosen. Myanmar wallets and MPU (directly or through an
 * aggregator) take one-time payments confirmed by a signed callback; Stripe
 * needs a non-Myanmar entity. Either way an adapter only collects payment for
 * a MyanLex invoice: pricing, proration and plan changes stay in MyanLex.
 *
 * The callback route verifies the request with parseCallback and, for a paid
 * result, calls InvoiceAdmin.recordPayment with method `provider`, the
 * provider name and its reference. The (provider, external_ref) unique index
 * makes replayed callbacks harmless.
 */
export interface PaymentProvider {
  /** Short name stored on payments, e.g. "dinger", "kbzpay", "stripe". */
  readonly name: string;

  /** Starts a payment for an open invoice: a hosted page, deep link or QR. */
  createPayment(invoice: {
    readonly number: string;
    readonly organizationId: string;
    readonly currency: string;
    readonly totalMinor: bigint;
    readonly description: string;
    readonly customerEmail: string;
    readonly returnUrl: string;
  }): Promise<{
    readonly externalRef: string;
    readonly redirectUrl?: string;
    readonly qrPayload?: string;
    readonly expiresAt?: Date;
  }>;

  /**
   * Verifies a callback (signature or hash, replay window) and describes it.
   * Anything unverifiable or irrelevant is `ignored`, never thrown at the
   * provider.
   */
  parseCallback(request: {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly rawBody: Buffer;
  }): Promise<
    | {
        readonly kind: 'paid';
        readonly externalRef: string;
        readonly invoiceNumber: string;
        readonly amountMinor: bigint;
        readonly currency: string;
      }
    | { readonly kind: 'ignored' }
  >;
}
