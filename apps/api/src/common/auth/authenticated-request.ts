import type { ApiKeyPrincipal } from '../../infrastructure/database/platform-repository.js';

export interface AuthenticatedRequest {
  readonly headers: {
    readonly authorization?: string;
    readonly cookie?: string;
    readonly origin?: string;
  };
  apiKeyPrincipal?: ApiKeyPrincipal;
  accountPrincipal?: { readonly userId: string };
}
