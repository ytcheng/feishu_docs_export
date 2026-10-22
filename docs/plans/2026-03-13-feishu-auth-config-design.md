# Feishu Auth Config Unification Design

**Date:** 2026-03-13

**Issue:** `#6` "BUG-飞书app扫码显示无法以此身份登陆"

## Problem

The app stores user-provided Feishu credentials in `localStorage.feishu_config`, and `feishuApi` uses that config when exchanging the OAuth code for tokens. However, the QR login flow in `src/components/AuthPage.tsx` still hardcodes a different Feishu App ID when it builds the OAuth authorize URL.

That creates a split auth flow:

- QR scan authorizes app A
- Token exchange uses app B

When the user scans with their own configured app, Feishu rejects the flow as an identity mismatch.

## Goals

- Remove the hardcoded Feishu App ID from the QR login flow.
- Make QR authorization and token exchange read from the same config source.
- Preserve the existing config storage format so current users do not need migration.
- Prevent the auth page from rendering a broken QR flow when config is missing or invalid.

## Non-Goals

- No migration away from `localStorage`.
- No broader auth state refactor with React context or global stores.
- No change to requested OAuth scopes in this issue.
- No redesign of the settings UI beyond what is needed for clearer auth behavior.

## Proposed Approach

Introduce a shared config access module that becomes the single source of truth for Feishu app configuration.

### Shared Config Access

Add a small utility that:

- Reads `localStorage.feishu_config`
- Safely parses JSON
- Verifies required fields: `appId`, `appSecret`, `endpoint`
- Returns a normalized config value when valid
- Returns `null` or a clear invalid result when config is absent or malformed

`feishuApi` will reuse this utility instead of keeping its own parsing logic. `AuthPage` will also use it before constructing the QR authorization URL.

### Auth Page Behavior

`AuthPage` should:

- Read the shared config before QR initialization
- Use `config.appId` as the OAuth `client_id`
- Skip QR initialization when config is invalid
- Show a user-facing error message and keep the "go to settings" path available

This keeps the page behavior safe: the user no longer gets a QR code that is guaranteed to fail.

### Data Flow

1. `SettingsPage` saves `feishu_config` to `localStorage`
2. Shared config utility reads and validates that stored value
3. `AuthPage` uses the validated config to build the authorize URL
4. `feishuApi` uses the same validated config for token exchange

Because both steps use the same source, the authorized app and token exchange app remain aligned.

## Testing Strategy

Follow TDD:

1. Add a failing test for config parsing and validation
2. Add a failing test for auth URL construction using configured `appId`
3. Implement the shared config utility and auth page changes
4. Re-run the targeted tests until they pass
5. Run repository verification commands before claiming completion

Planned coverage:

- Valid config returns normalized values
- Missing fields are treated as invalid
- Malformed JSON is treated as invalid
- Auth URL includes configured `appId`
- Auth flow no longer depends on the removed hardcoded App ID

## Risks

- The repository currently has no frontend test harness, so adding tests may require introducing a minimal test setup.
- `AuthPage` currently mixes QR initialization, plugin setup, and side effects in one component; tests should target extracted pure helpers where possible to avoid brittle DOM-heavy coverage.

## Success Criteria

- A user-configured Feishu app can complete QR login without identity mismatch caused by a hardcoded App ID.
- There is no remaining hardcoded Feishu App ID in the login path.
- Shared config parsing logic is reused by both auth URL generation and token exchange.
- Regression tests cover the config source and auth URL behavior.
