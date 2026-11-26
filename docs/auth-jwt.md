# Native JWT resource authentication

Uses the installed Better Auth 1.7.7 `verifyAccessTokenRequest`.
SDK verifies signature, issuer, audience, expiry, token type, max token age and
configured scopes, and owns cached JWKS loading/rotation. No custom JWT verifier,
JWK cache, introspection client or second Better Auth server is introduced.

This service accepts JWT bearer tokens only, never ID tokens or opaque tokens.
Existing DPoP grants are not accepted on these bearer-only endpoints; enabling
them later requires a durable shared proof store for multi-instance deployments.
Client/application binding and local ownership/roles remain service policy.
SSO avatar requests use the registered `gorth-single-sign-on` client, bound to
application `sso` and `sso:read`/`sso:write`. A server-only Better Auth endpoint
issues a JWKS-signed `at+jwt` from an authoritative active SSO session. Its
lifetime is at most 120 seconds (or a shorter registered resource TTL), never
the browser session cookie, and no bearer token is returned to browser UI.
The existing Media verifier is unchanged; SSO cannot borrow a vertical app's
scope. UserInfo still requires the persisted client/resource registration.
An app cannot borrow another app's scope. Only the named SSO client is added to the allowlist.
No arbitrary discovery-supplied destination can redirect key requests.

JWT lifetime is limited to 600 seconds with no extra clock-skew allowance.
As explicitly approved, a valid issued JWT may remain usable after SSO logout,
ban or client disable until expiry (at most ten minutes). This is NOT immediate
revocation. No new revocation table is introduced. SSO delegation is shorter-lived
(at most two minutes), and requires its explicit persisted client/resource setup.
The storage profile migration is separate from authentication. Webhooks and
non-user/background authentication are unchanged.

Native token authentication has no UserInfo hop on each API request.
The service still needs a local user row for foreign keys. It reads that row by
verified SSO `sub`, not another application's local UUID. UserInfo is used only
for initial provisioning or refreshing profile data older than ten minutes;
concurrent provisioning is coalesced per subject. Warm requests read the user
without upserting or updating lastSeenAt on every call.
Profile reads are bounded by a timeout, disallow redirects, validate shape and
subject, and reject inactive profiles. Existing role projection is retained on
profile synchronization, not reconstructed from an unverified token.
Local inactive/deleted/banned users remain blocked and profile synchronization no longer resets local status to active.

`NITRO_PUBLIC_AUTH_URL` is the public SSO origin (fullstack SSO: port 3000
in development). The service resolves its audience and enabled client bindings
from the SSO Application Directory for its environment. It caches the directory
for 30 seconds and refuses requests when the directory cannot be refreshed.
Secrets and environment reads remain service-owned.

Verification: `pnpm typecheck`, `pnpm test:types`, `pnpm test`, `pnpm build`.
Native signed-token tests cover claims/scopes/signature, token type/lifetime,
warm JWKS caching and safe error mapping. Business/DB adapters are mocked;
these are not live cloud or browser latency benchmarks.

[Official resource-server verification](https://better-auth.com/docs/plugins/oauth-provider#verification)
