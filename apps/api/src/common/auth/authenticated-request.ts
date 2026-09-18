import type { ApiKeyPrincipal } from '../../infrastructure/database/platform-repository.js';

export interface AuthenticatedRequest {
  readonly headers: { readonly authorization?: string };
  apiKeyPrincipal?: ApiKeyPrincipal;
}
