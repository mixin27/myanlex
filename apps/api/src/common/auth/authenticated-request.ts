import type { ApiKeyPrincipal } from '../../infrastructure/database/platform-repository.js';

export interface AuthenticatedRequest {
  /** Fastify request id, also reported in problem details and logs. */
  readonly id?: string;
  readonly headers: {
    readonly authorization?: string;
    readonly cookie?: string;
    readonly origin?: string;
  };
  apiKeyPrincipal?: ApiKeyPrincipal;
  accountPrincipal?: { readonly userId: string; readonly email: string };
}
