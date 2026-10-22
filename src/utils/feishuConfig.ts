export interface FeishuConfig {
  appId: string;
  appSecret: string;
  endpoint: string;
}

export function parseFeishuConfig(configStr: string | null): FeishuConfig | null {
  if (!configStr) {
    return null;
  }

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

export function isFeishuConfigValid(
  config: Partial<FeishuConfig> | null | undefined
): boolean {
  return !!(config?.appId && config.appSecret && config.endpoint);
}
