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
