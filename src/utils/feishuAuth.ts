export interface FeishuAuthorizeUrlInput {
  appId: string;
  redirectUri: string;
  scope: string;
  state?: string;
}

export function buildFeishuAuthorizeUrl({
  appId,
  redirectUri,
  scope,
  state = 'STATE',
}: FeishuAuthorizeUrlInput): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
  });

  return `https://passport.feishu.cn/suite/passport/oauth/authorize?${params.toString()}`;
}
