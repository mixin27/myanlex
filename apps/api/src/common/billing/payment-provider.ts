/**
 * The checkout channel's payment provider (ADR 0025). Nothing implements or
 * injects this yet: every plan change takes the approval channel until a
 * provider is chosen. An implementation will create plan changes in
 * `awaiting_payment` with an `externalRef`, and apply them from verified,
 * idempotent webhooks through `applyPlanChange`.
 */
export interface PaymentProvider {
  /** Starts a hosted checkout for a plan change; returns where to send the payer. */
  startCheckout(input: {
    readonly planChangeId: string;
    readonly organizationId: string;
    readonly planSlug: string;
    readonly customerEmail: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
  }): Promise<{ readonly externalRef: string; readonly redirectUrl: string }>;

  /**
   * Verifies a webhook (signature, replay window) and describes it, so the
   * caller can apply, cancel or expire the matching plan change exactly once.
   */
  handleWebhook(request: {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly rawBody: Buffer;
  }): Promise<
    | {
        readonly kind: 'paid';
        readonly externalRef: string;
        readonly eventId: string;
      }
    | {
        readonly kind: 'expired';
        readonly externalRef: string;
        readonly eventId: string;
      }
    | { readonly kind: 'ignored' }
  >;

  /** Stops the provider's recurring billing when a workspace leaves a paid plan. */
  cancelSubscription(externalRef: string): Promise<void>;
}
