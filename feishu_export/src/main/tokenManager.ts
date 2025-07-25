import * as https from 'https';
import * as lark from '@larksuiteoapi/node-sdk';

const FEISHU_APP_ID = 'cli_a1ad86f33c38500d';
const FEISHU_APP_SECRET = 'iNw9h4HWv10gsyk0ZbOejhJs7YwHVQo3';

/**
 * Token管理器，处理token刷新和API调用重试
 */
export class TokenManager {
  private static instance: TokenManager;
  private larkClient: lark.Client;
  private onTokenExpired?: () => void;
  private getRefreshTokenFn?: () => Promise<string | null>;
  private updateTokensFn?: (accessToken: string, refreshToken: string) => Promise<boolean>;

  constructor(larkClient: lark.Client) {
    this.larkClient = larkClient;
  }

  /**
   * 获取TokenManager单例
   */
  static getInstance(larkClient: lark.Client): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager(larkClient);
    }
    return TokenManager.instance;
  }

  /**
   * 设置token过期回调
   */
  setTokenExpiredCallback(callback: () => void) {
    this.onTokenExpired = callback;
  }

  /**
   * 设置IPC处理函数
   */
  setIpcHandlers(
    getRefreshTokenFn: () => Promise<string | null>,
    updateTokensFn: (accessToken: string, refreshToken: string) => Promise<boolean>
  ) {
    this.getRefreshTokenFn = getRefreshTokenFn;
    this.updateTokensFn = updateTokensFn;
  }

  /**
   * 刷新用户access_token
   * @param refreshToken - 刷新令牌
   * @returns Promise<any> - 返回新的token信息
   */
  private refreshUserAccessToken(refreshToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        grant_type: 'refresh_token',
        client_id: FEISHU_APP_ID,
        client_secret: FEISHU_APP_SECRET,
        refresh_token: refreshToken
      });

      const options = {
        hostname: 'open.feishu.cn',
        path: '/open-apis/authen/v2/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (result.code === 0) {
              resolve(result.data);
            } else {
              reject(new Error(`刷新token失败: ${result.msg}`));
            }
          } catch (e) {
            reject(new Error(`JSON解析错误: ${body}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`请求错误: ${e.message}`));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * 从localStorage获取refresh_token
   * 注意：这个函数需要在渲染进程中调用，主进程无法直接访问localStorage
   */
  private async getRefreshToken(): Promise<string | null> {
    if (this.getRefreshTokenFn) {
      return await this.getRefreshTokenFn();
    }
    console.error('getRefreshTokenFn未设置');
    return null;
  }

  private async updateTokens(accessToken: string, refreshToken: string): Promise<boolean> {
    if (this.updateTokensFn) {
      return await this.updateTokensFn(accessToken, refreshToken);
    }
    console.error('updateTokensFn未设置');
    return false;
  }

  /**
   * 包装larkClient API调用，自动处理401错误和token刷新
   * @param apiCall - API调用函数
   * @param accessToken - 当前访问令牌
   * @returns Promise<any> - API调用结果
   */
  async callWithTokenRefresh<T>(
    apiCall: (token: string) => Promise<T>,
    accessToken: string
  ): Promise<T> {
    try {
      // 首次尝试调用API
      return await apiCall(accessToken);
    } catch (error: any) {
      // 检查是否是401错误
      if (error.response?.status === 401 || error.code === 99991663) {
        console.log('检测到token过期，尝试刷新token...');
        
        // 自动获取refresh_token
        const refreshToken = await this.getRefreshToken();
        if (!refreshToken) {
          console.error('没有refresh_token，无法刷新');
          if (this.onTokenExpired) {
            this.onTokenExpired();
          }
          throw new Error('Token已过期且无法刷新，请重新登录');
        }

        try {
          // 刷新token
          const tokenData = await this.refreshUserAccessToken(refreshToken);
          console.log('Token刷新成功');
          
          // 更新tokens
          await this.updateTokens(tokenData.access_token, tokenData.refresh_token);
          
          // 使用新token重试API调用
          return await apiCall(tokenData.access_token);
        } catch (refreshError) {
          console.error('刷新token失败:', refreshError);
          if (this.onTokenExpired) {
            this.onTokenExpired();
          }
          throw new Error('Token刷新失败，请重新登录');
        }
      } else {
        // 非401错误，直接抛出
        throw error;
      }
    }
  }

  /**
   * 包装larkClient.request调用
   */
  async request(
    config: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.request(config, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装drive.v1.file.list调用
   */
  async driveFileList(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.drive.v1.file.list(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装wiki.v2.space.list调用
   */
  async wikiSpaceList(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.wiki.v2.space.list(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装wiki.v2.spaceNode.list调用
   */
  async wikiSpaceNodeList(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.wiki.v2.spaceNode.list(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装drive.v1.exportTask.create调用
   */
  async driveExportTaskCreate(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.drive.v1.exportTask.create(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装drive.v1.exportTask.get调用
   */
  async driveExportTaskGet(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.drive.v1.exportTask.get(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装drive.v1.file.download调用
   */
  async driveFileDownload(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.drive.v1.file.download(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }

  /**
   * 包装drive.v1.exportTask.download调用
   */
  async driveExportTaskDownload(
    params: any,
    accessToken: string
  ): Promise<any> {
    return this.callWithTokenRefresh(
      (token) => this.larkClient.drive.v1.exportTask.download(params, lark.withUserAccessToken(token)),
      accessToken
    );
  }
}