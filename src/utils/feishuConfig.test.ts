import { describe, expect, it } from 'vitest';
import { isFeishuConfigValid, parseFeishuConfig } from './feishuConfig';

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
