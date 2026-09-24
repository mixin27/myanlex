# ADR 0015: Dedicated public MDX documentation

Status: accepted.

Use a separate `apps/docs` Next.js application scaffolded with the official
Fumadocs CLI. Keep API-consumer guides independent of a platform checkout;
self-hosting and contribution instructions are separate navigation sections. MDX
supports highlighted/copyable code, tabs, steps, callouts and searchable content
without a hand-built documentation renderer.

Use the checked-in OpenAPI document for generated operation pages and the
downloadable schema. Do not copy schemas or invent linguistic behavior. The
public site does not collect API keys, proxy requests or share console sessions;
interactive testing remains in deployment-local Scalar. No new CORS trust is
introduced. Only trusted repository MDX is compiled.

Centralize developer-preview messaging behind one flag. Registry commands are
future-facing and explicitly marked unavailable while the flag is on; current
HTTP and local SDK alternatives remain documented. Disabling the notice is not a
release process: verify package ownership, versions, service URLs and examples
before launch.

The console links to the dedicated origin; the former web `/docs` entry
redirects there. Keep the existing same-origin platform Scalar entry for session
testing. The docs app uses no database or auth secrets. Build from the monorepo
with the OpenAPI file available; deployment URL changes require a rebuild.

Verification includes content/link tests, production HTTP checks for search,
rendered pages and OpenAPI, plus executable API examples. Computer-use UI checks
are deliberately not part of this milestone.

References:
[Fumadocs Next.js setup](https://www.fumadocs.dev/docs/manual-installation/next),
[OpenAPI integration](https://www.fumadocs.dev/docs/integrations/openapi).
