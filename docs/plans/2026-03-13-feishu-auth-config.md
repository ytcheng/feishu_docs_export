# Feishu Auth Config Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the hardcoded Feishu App ID from the QR login flow and make OAuth authorization plus token exchange read from one shared config source.

**Architecture:** Add a shared config utility for loading and validating `localStorage.feishu_config`, then extract a small auth helper that builds the authorize URL from validated config. Refactor `feishuApi` and `AuthPage` to consume those helpers so both stages of the OAuth flow use the same `appId`.

**Tech Stack:** React 19, TypeScript, Vite, Tauri, Vitest

---

### Task 1: Add a test harness and capture config parsing behavior

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/utils/feishuConfig.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseFeishuConfig, isFeishuConfigValid } from './feishuConfig';

describe('parseFeishuConfig', () => {
  it('returns normalized config when all required fields are present', () => {
    const config = parseFeishuConfig(
      JSON.stringify({
        appId: 'cli_custom_app',
        appSecret: 'secret-value',
        endpoint: 'https://open.feishu.cn/open-apis',
      })
    );

    expect(config).toEqual({
      appId: 'cli_custom_app',
      appSecret: 'secret-value',
      endpoint: 'https://open.feishu.cn/open-apis',
    });
  });

  it('returns null when required fields are missing', () => {
    expect(parseFeishuConfig(JSON.stringify({ appId: 'cli_only' }))).toBeNull();
  });

  it('returns null for malformed json', () => {
    expect(parseFeishuConfig('{bad json')).toBeNull();
  });
});

describe('isFeishuConfigValid', () => {
  it('returns true only for a complete config object', () => {
    expect(
      isFeishuConfigValid({
        appId: 'cli_custom_app',
        appSecret: 'secret-value',
        endpoint: 'https://open.feishu.cn/open-apis',
      })
    ).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/feishuConfig.test.ts`

Expected: FAIL because `vitest` and `src/utils/feishuConfig.ts` do not exist yet.

**Step 3: Add minimal test tooling**

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Do not add browser-heavy test libraries. Keep the first test target pure and cheap.

**Step 4: Run test to verify it still fails for the right reason**

Run: `npm run test -- src/utils/feishuConfig.test.ts`

Expected: FAIL because `parseFeishuConfig` is not implemented yet.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/feishuConfig.test.ts
git commit -m "test: add coverage for feishu config parsing"
```

### Task 2: Implement shared Feishu config loading

**Files:**
- Create: `src/utils/feishuConfig.ts`
- Modify: `src/utils/feishuApi.ts`

**Step 1: Write the minimal implementation**

```ts
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  endpoint: string;
}

export function parseFeishuConfig(configStr: string | null): FeishuConfig | null {
  if (!configStr) return null;

  try {
    const parsed = JSON.parse(configStr) as Partial<FeishuConfig>;
    if (!parsed.appId || !parsed.appSecret || !parsed.endpoint) {
      return null;
    }

    return {
      appId: parsed.appId,
      appSecret: parsed.appSecret,
      endpoint: parsed.endpoint,
    };
  } catch {
    return null;
  }
}

export function loadFeishuConfig(): FeishuConfig | null {
  return parseFeishuConfig(localStorage.getItem('feishu_config'));
}

export function isFeishuConfigValid(config: Partial<FeishuConfig> | null | undefined): boolean {
  return !!(config?.appId && config?.appSecret && config?.endpoint);
}
```

Update `src/utils/feishuApi.ts` so:

- `FeishuConfig` is imported from `src/utils/feishuConfig.ts`
- `loadConfig()` delegates to `loadFeishuConfig()`
- `hasValidConfig()` delegates to `loadFeishuConfig() !== null`

Keep the existing fallback return shape for `loadConfig()` so current callers do not break.

**Step 2: Run test to verify it passes**

Run: `npm run test -- src/utils/feishuConfig.test.ts`

Expected: PASS

**Step 3: Run type check on touched files**

Run: `npm run type-check`

Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/feishuConfig.ts src/utils/feishuApi.ts
git commit -m "refactor: centralize feishu config loading"
```

### Task 3: Capture auth URL behavior with a failing test

**Files:**
- Create: `src/utils/feishuAuth.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildFeishuAuthorizeUrl } from './feishuAuth';

describe('buildFeishuAuthorizeUrl', () => {
  it('uses the configured app id as client_id', () => {
    const url = buildFeishuAuthorizeUrl({
      appId: 'cli_custom_app',
      redirectUri: 'http://localhost:3000/callback',
      scope: 'docs:doc offline_access',
      state: 'STATE',
    });

    expect(url).toContain('client_id=cli_custom_app');
    expect(url).not.toContain('cli_a1ad86f33c38500d');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/feishuAuth.test.ts`

Expected: FAIL because `src/utils/feishuAuth.ts` does not exist yet.

**Step 3: Commit**

```bash
git add src/utils/feishuAuth.test.ts
git commit -m "test: cover feishu auth url generation"
```

### Task 4: Refactor auth flow to use the shared config source

**Files:**
- Create: `src/utils/feishuAuth.ts`
- Modify: `src/components/AuthPage.tsx`

**Step 1: Write the minimal implementation**

```ts
export function buildFeishuAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  scope: string;
  state?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: input.scope,
    state: input.state ?? 'STATE',
  });

  return `https://passport.feishu.cn/suite/passport/oauth/authorize?${params.toString()}`;
}
```

Refactor `AuthPage.tsx` so:

- the hardcoded `FEISHU_APP_ID` constant is removed
- the component reads shared config through `loadFeishuConfig()`
- QR initialization returns early when config is invalid
- the authorize URL is built through `buildFeishuAuthorizeUrl()`
- the existing "go to settings" link remains visible when config is invalid

If the config is invalid, show a user-facing message once instead of trying to open a broken QR flow.

**Step 2: Run targeted tests**

Run: `npm run test -- src/utils/feishuConfig.test.ts src/utils/feishuAuth.test.ts`

Expected: PASS

**Step 3: Run lint and type check**

Run: `npm run lint`
Expected: PASS

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/feishuAuth.ts src/components/AuthPage.tsx
git commit -m "fix: use configured feishu app id for oauth"
```

### Task 5: Final verification for the branch

**Files:**
- Review only: `src/components/AuthPage.tsx`
- Review only: `src/utils/feishuApi.ts`
- Review only: `src/utils/feishuConfig.ts`
- Review only: `src/utils/feishuAuth.ts`

**Step 1: Run the full frontend verification**

Run: `npm run test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run type-check`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 2: Review the diff**

Run: `git status --short`
Expected: only intended files changed

Run: `git diff --stat origin/main...HEAD`
Expected: auth config changes, tests, and plan docs only

**Step 3: Prepare PR**

Run:

```bash
git push origin fix-issue-6-auth-config
gh pr create --repo ytcheng/feishu_docs_export --base main --head fix-issue-6-auth-config --title "fix: use configured Feishu app id for OAuth" --body "<fill with summary, test evidence, closes #6>"
```

Expected: branch pushed and PR URL returned
