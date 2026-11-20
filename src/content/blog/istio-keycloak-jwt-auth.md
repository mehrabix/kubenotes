---
title: 'Istio + Keycloak: Validate JWTs and Protect APIs'
description: 'A current, practical guide to validating Keycloak access tokens with Istio and authorizing requests with JWT claims.'
pubDate: 'Nov 20 2026'
---

Keycloak and Istio fit together well when their responsibilities are kept clear: Keycloak authenticates users and issues tokens; Istio validates bearer access tokens at the proxy and applies request-level authorization. The application can then focus on its own business rules.

This guide uses Istio's current `security.istio.io/v1` APIs. It covers APIs that receive bearer tokens. It does **not** make a browser redirect to a Keycloak login page.

## What happens to a request

1. A client completes an OpenID Connect flow with Keycloak and receives an **access token**.
2. The client sends that token as `Authorization: Bearer <token>` to the API.
3. Istio verifies the JWT signature, issuer, expiration, and configured audience using Keycloak's public signing keys.
4. An `AuthorizationPolicy` decides whether the verified identity or claims may call the workload.

Do not send an ID token to an API in place of an access token. Do not treat a valid signature as authorization: signature validation alone does not grant a caller permission to use a service.

## 1. Confirm Keycloak's issuer and signing-key URL

Use the issuer URL that Keycloak publishes, not one guessed from an internal service name. For a realm named `platform`, it commonly looks like this:

```sh
export KEYCLOAK_ISSUER='https://sso.example.com/realms/platform'

curl -fsS "${KEYCLOAK_ISSUER}/.well-known/openid-configuration" |
  jq '{issuer, jwks_uri, authorization_endpoint, token_endpoint}'
```

The `issuer` returned by discovery must exactly match the `iss` claim in the access token. The `jwks_uri` points to the signing keys Istio needs. A typical Keycloak JWKS URL is:

```text
https://sso.example.com/realms/platform/protocol/openid-connect/certs
```

Keycloak installations using a custom hostname or a configured relative path may publish a different issuer. Use the actual discovery response and make sure its URLs are reachable with valid TLS from the Istio control plane.

## 2. Put the API audience in the access token

The token's `aud` claim should name the API that will accept it. For example, use `orders-api` as the API audience. In Keycloak, add an **Audience** protocol mapper to the client or client scope used to obtain the token:

- Set **Included Client Audience** to `orders-api` (or use a custom audience that matches your API design).
- Enable **Add to access token**.
- Attach that client scope to the client that obtains the access token.

Then confirm the resulting **access token** has `orders-api` in `aud`. An audience mismatch is a common reason for `401` responses. Do not disable audience checking to work around it; correct the client scope or mapper instead.

If authorization will depend on groups, add a Keycloak **Group Membership** protocol mapper that emits a `groups` claim in the access token. Keep the claim values consistent with the values in your policy. For example, with full group paths disabled, the value might be `orders-readers`; with full paths enabled it may instead be `/teams/orders-readers`.

## 3. Validate JWTs and require them for the API

Save this as `keycloak-istio-jwt.yaml`, replacing the issuer, audience, namespace, and workload label with your own:

```yaml
apiVersion: security.istio.io/v1
kind: RequestAuthentication
metadata:
  name: orders-keycloak-jwt
  namespace: apps
spec:
  selector:
    matchLabels:
      app: orders
  jwtRules:
    - issuer: "https://sso.example.com/realms/platform"
      jwksUri: "https://sso.example.com/realms/platform/protocol/openid-connect/certs"
      audiences:
        - orders-api
---
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: orders-require-keycloak-user
  namespace: apps
spec:
  selector:
    matchLabels:
      app: orders
  action: ALLOW
  rules:
    - from:
        - source:
            requestPrincipals:
              - "https://sso.example.com/realms/platform/*"
```

Both selectors must match the **pod labels** of the API, and both policies belong in the API's namespace. Apply and inspect them:

```sh
kubectl apply -f keycloak-istio-jwt.yaml
kubectl get requestauthentication,authorizationpolicy -n apps
```

`RequestAuthentication` checks a token when one is present, but by itself it still permits a request with no token. The `ALLOW` policy above closes that gap: only a request with a valid token from the configured issuer matches. With this policy in effect, a missing token is denied with `403`; an invalid or expired token is rejected during JWT validation, typically with `401`.

The example allows any authenticated subject from that realm. If users have different permissions, use a claim policy instead. For example, **replace** the sample `AuthorizationPolicy` with this one to require a Keycloak `groups` claim containing `orders-readers`:

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: orders-readers-only
  namespace: apps
spec:
  selector:
    matchLabels:
      app: orders
  action: ALLOW
  rules:
    - from:
        - source:
            requestPrincipals:
              - "https://sso.example.com/realms/platform/*"
      when:
        - key: request.auth.claims[groups]
          values:
            - orders-readers
```

Do not install both example `ALLOW` policies expecting them to act as a stricter combination. Matching `ALLOW` rules across policies are additive: the first policy would still allow any authenticated subject. Review existing policies for the selected workload too; a broader `ALLOW` rule can undermine a narrower one.

## 4. Smoke-test with a real access token

For a command-line smoke test, use a dedicated confidential Keycloak client with **Service accounts enabled** and only the minimum roles it needs. Keep its secret in your shell's secret manager or environment; never commit it:

```sh
export CLIENT_ID='orders-smoke-test'
# Set CLIENT_SECRET securely in your environment; do not put it in source control.

TOKEN=$(
  curl -fsS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
    -d grant_type=client_credentials \
    "${KEYCLOAK_ISSUER}/protocol/openid-connect/token" |
    jq -er '.access_token'
)

curl -i \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API_URL}/health"
```

The client-credentials flow tests a service account, not an interactive human login. For browser users, use the OIDC authorization-code flow with PKCE in the application, or put a dedicated OIDC-aware authentication proxy in front of it. Istio JWT authentication does not implement the browser login redirect, maintain a login session, or exchange an authorization code.

The smoke-test token will only pass the `groups` policy if the service account's access token actually contains the required group. Otherwise, use a test token from a user in that group or explicitly map the service account to the required group.

Check all three cases before rollout:

| Request | Expected result |
| --- | --- |
| Valid access token with the right issuer, audience, and required claims | Allowed by policy |
| No token | Denied by the `ALLOW` policy |
| Expired, malformed, wrong-issuer, or wrong-audience token | Rejected by JWT validation |

Use a staging realm and test service first. Also verify the actual token claims, the API's workload labels, and any pre-existing authorization policies. If the application itself must read the bearer token, set `forwardOriginalToken: true` on the JWT rule deliberately; otherwise leave forwarding disabled so the proxy does not pass the token upstream unnecessarily.

## A note on older Istio + Keycloak guides

The [2018 Keycloak post](https://www.keycloak.org/2018/02/keycloak-and-istio) and its [demo configuration](https://github.com/kameshsampath/istio-keycloak-demo/blob/master/cars-api/src/istio/car-api-auth_config.yaml) are useful historical context, but they use Istio's old Mixer-era `EndUserAuthenticationPolicySpec` API. Do not copy that YAML into a current Istio mesh. Use the supported `RequestAuthentication` and `AuthorizationPolicy` APIs shown above.

## References

- [Istio: Authentication policy and end-user JWTs](https://istio.io/latest/docs/tasks/security/authentication/authn-policy/)
- [Istio: Authorize requests using JWT claims](https://istio.io/latest/docs/tasks/security/authorization/authz-jwt/)
- [Istio: `RequestAuthentication` reference](https://istio.io/latest/docs/reference/config/security/request_authentication/)
- [Keycloak: OIDC endpoints](https://www.keycloak.org/securing-apps/oidc-layers)
- [Keycloak: Server administration and protocol mappers](https://www.keycloak.org/docs/latest/server_admin/#_protocol-mappers)
