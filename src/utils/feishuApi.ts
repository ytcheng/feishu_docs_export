import axios, { AxiosInstance, AxiosAdapter } from 'axios';

import { fetch } from './http';
import { writeTextFile, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { dirname } from '@tauri-apps/api/path';
import {
  TokenInfo,
  UserInfo,
  FeishuRootMeta,
  FeishuFile,
  FeishuFilesPagination,
  FeishuWikiSpace,
  FeishuWikiSpacesPagination,
  FeishuWikiNode,
  FeishuWikiNodesPagination,
  ExportTaskRequest,
  ExportTaskResponse,
  ExportTaskStatus,
  ExportTaskResult,
  FeishuApiOptions,
  FileDownloadOptions,
  PaginationOptions,
  FileQueryOptions,
  WikiNodeQueryOptions,
} from '../types/feishuApi';
const FEISHU_SCOPE = 'docs:doc docs:document.media:download docs:document:export docx:document drive:drive drive:file drive:file:download offline_access';
function buildFullPath(baseURL: string | undefined, requestedURL: string): string {
  if (baseURL && !/^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(requestedURL)) {
    return baseURL.replace(/\/+$/, '') + '/' + requestedURL.replace(/^\/+/, '');
  }
  return requestedURL;
}

function buildURL(url: string, params?: Record<string, any>): string {
  if (!params) return url;

  const queryString = Object.entries(params)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join('&');

  if (!queryString) return url;

  const separator = url.includes('?') ? '&' : '?';
  return url + separator + queryString;
}
/**
 * 创建Tauri适配器，用于axios与Tauri的fetch API集成
 */
const createTauriAdapter = (): AxiosAdapter => {
  return async (config) => {
    // 处理baseURL和相对路径的拼接
    let url = config.url!;
    if (config.baseURL && !url.startsWith('http')) {
      url = buildURL(buildFullPath(config.baseURL, config.url!), config.params)
    }else{
      url = buildURL(url, config.params)
    }

    
    const method = config.method?.toUpperCase() || 'GET';
    const headers = config.headers || {};
    const data = config.data;
    const responseType = config.responseType || 'json';

    try {
      console.log("createTauriAdapter url", url, "method", method, "headers", headers, "data", data, "data type", typeof data);
      
      // 处理请求体数据
      let body: string | undefined;
      if (data) {
        if (typeof data === 'string') {
          body = data;
        } else {
          body = JSON.stringify(data);
        }
      }
      
      const response = await fetch(url, {
        method,
        headers,
        body,
      });
      console.log("createTauriAdapter response", response.clone());
      let responseData;
      
      // 根据responseType处理响应数据
      switch (responseType) {
        case 'arraybuffer':
          responseData = await response.arrayBuffer();
          break;
        case 'blob':
          responseData = await response.blob();
          break;
        case 'formdata': 
          responseData = await response.formData();
          break;
        case 'text':
          responseData = await response.text();
          break;
        case 'json':
          const textData = await response.text();
          try {
            responseData = JSON.parse(textData);
          } catch {
            responseData = textData;
          }
          break;
        default:
          throw new Error('Response type unsupported type: ' + responseType)
      }

      // 检查 HTTP 状态码
      if (!response.ok) {
        // console.log("createTauriAdapter responseData", response.clone());
        const error: any = new Error(`Request failed with status code ${response.status}`);
        error.config = config;
        error.request = {};
        error.response = {
          data: responseData,
          status: response.status,
          statusText: response.statusText || '',
          headers: Object.fromEntries(response.headers.entries()),
          config,
          request: {},
        };
        throw error;
      }

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText || '',
        headers: Object.fromEntries(response.headers.entries()),
        config,
        request: {},
      };
    } catch (error) {
      console.log("createTauriAdapter error", error);
      if(error instanceof Error) {
        console.log("createTauriAdapter error", error, error.stack);
      }
      throw error;
    }
  };
};

/**
 * 飞书API客户端类
 * 基于axios和Tauri实现的飞书API封装
 */
export class FeishuApi {
  private static instance: FeishuApi;
  private httpClient: AxiosInstance;
  private appId: string;
  private appSecret: string;
  private endpoint: string;
  private accessToken?: string;
  private refreshToken?: string;

  /**
   * 构造函数
   * @param options 飞书API配置选项
   */
  constructor(options: FeishuApiOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.endpoint = options.endpoint || 'https://open.feishu.cn/open-apis';

    // 创建axios实例，使用Tauri adapter
    this.httpClient = axios.create({
      baseURL: this.endpoint,
      timeout: 30000,
      adapter: createTauriAdapter(),
    });

    // 添加请求拦截器，自动添加access token
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log("this.httpClient.interceptors.request config", config);
        if (this.accessToken && !config.headers['Authorization']) {
          config.headers['Authorization'] = `Bearer ${this.accessToken}`;
          config.headers['Content-Type'] = 'application/json';
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 添加响应拦截器，处理token过期和API错误
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log("response", response);
        // 检查飞书API的业务错误码
        if (response.data && response.data.code !== undefined && response.data.code !== 0) {
          const errorMessage = response.data.error ? response.data.error + ":" + response.data.error_description : response.data.msg | response.data.message || 'Unknown error';
          throw new Error(`API Error: ${errorMessage}`);
        }
        // 返回实际数据，而不是包装的ApiResponse
        return response.data.data !== undefined ? { ...response, data: response.data.data } : response;
      },
      async (error) => {
        console.log("error", error);
        const originalRequest = error.config;
        
        // 如果是401错误且还没有重试过，尝试刷新token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            await this.refreshAccessToken();
            // 重新设置Authorization头
            originalRequest.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return this.httpClient(originalRequest);
          } catch (refreshError) {
            // 刷新失败，清除token
            await this.removeToken();
            throw refreshError;
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取单例实例
   */
  static getInstance(): FeishuApi {
    if (!FeishuApi.instance) {
      const option = {
        appId: 'cli_a1ad86f33c38500d',
        appSecret: 'iNw9h4HWv10gsyk0ZbOejhJs7YwHVQo3',
        endpoint: 'https://open.feishu.cn/open-apis',
      }
      FeishuApi.instance = new FeishuApi(option);
      FeishuApi.instance.readToken();
    }
    return FeishuApi.instance;
  }

  /**
   * 读取保存的token信息
   */
  async readToken(): Promise<TokenInfo | null> {
    try {
      const tokenStr = localStorage.getItem('feishu_token');
      
      if (!tokenStr) {
        return null;
      }
      
      const tokenInfo: TokenInfo = JSON.parse(tokenStr);
      
      this.accessToken = tokenInfo.access_token;
      this.refreshToken = tokenInfo.refresh_token;
      
      return tokenInfo;
    } catch (error) {
      console.error('Failed to read token:', error);
      return null;
    }
  }

  /**
   * 保存token信息到localStorage
   * @param tokenInfo token信息
   */
  async saveToken(tokenInfo: TokenInfo): Promise<void> {
    try {
      tokenInfo.expires_at = Math.floor(Date.now() / 1000) + tokenInfo.refresh_expires_in;
      localStorage.setItem('feishu_token', JSON.stringify(tokenInfo));
      
      this.accessToken = tokenInfo.access_token;
      this.refreshToken = tokenInfo.refresh_token;
    } catch (error) {
      console.error('Failed to save token:', error);
      throw error;
    }
  }

  /**
   * 删除保存的token信息
   */
  async removeToken(): Promise<void> {
    try {
      localStorage.removeItem('feishu_token');
      
      this.accessToken = undefined;
      this.refreshToken = undefined;
    } catch (error) {
      console.error('Failed to remove token:', error);
    }
  }

  /**
   * 检查token是否有效
   */
  async checkToken(): Promise<boolean> {
    const tokenInfo = await this.readToken();
    console.log("checkToken", tokenInfo);
    if (!tokenInfo) {
      return false;
    }

    // 检查token是否过期（提前5分钟）
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = tokenInfo.expires_at || 0;
    console.log("checkToken", expiresAt, now + 300);
    return expiresAt > now + 300; // 提前5分钟
  }



  /**
   * 获取访问令牌
   * @param code 授权码
   */
  async getAccessToken(code: string, redirectUri: string): Promise<TokenInfo> {
    const response = await this.httpClient.post<TokenInfo>(
      'https://passport.feishu.cn/suite/passport/oauth/token',
      {
        grant_type: 'authorization_code',
        client_id: this.appId,
        client_secret: this.appSecret,
        code,
        redirect_uri: redirectUri,
        scope: FEISHU_SCOPE
      }
    );

     const tokenInfo = response.data;
     await this.saveToken(tokenInfo);
     return tokenInfo;
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(): Promise<TokenInfo> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await this.httpClient.post<TokenInfo>(
      'https://passport.feishu.cn/suite/passport/oauth/token',
      {
        client_id: this.appId,
        client_secret: this.appSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }
    );

     const tokenInfo = response.data;
     await this.saveToken(tokenInfo);
     return tokenInfo;
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<UserInfo> {
    const response = await this.httpClient.get<UserInfo>(
      '/authen/v1/user_info'
    );

     return response.data;
  }

  /**
   * 获取根文件夹元数据
   */
  async rootFolderMeta(): Promise<FeishuRootMeta> {
    const response = await this.httpClient.get<FeishuRootMeta>(
      '/drive/explorer/v2/root_folder/meta',
      {}
    );

     return response.data;
  }

  /**
   * 分页获取文件夹文件列表
   * @param folderId 文件夹ID
   * @param options 分页选项
   */
  async driveFilesPagination(
    folderId: string,
    options: PaginationOptions & FileQueryOptions = {}
  ): Promise<FeishuFilesPagination> {
    const { pageSize = 200, pageToken, orderBy, direction } = options;
    
    const params: any = {
      folder_token: folderId,
      page_size: pageSize,
      user_id_type: 'user_id',
    };
    
    if (pageToken) params.page_token = pageToken;
    if (orderBy) params.order_by = orderBy;
    if (direction) params.direction = direction;

    const response = await this.httpClient.get<FeishuFilesPagination>(
      '/drive/v1/files',
      { params }
    );

     return response.data;
  }

  /**
   * 获取文件夹所有文件列表
   * @param folderId 文件夹ID
   * @param options 查询选项
   */
  async driveFiles(
    folderId: string,
    options: FileQueryOptions = {}
  ): Promise<FeishuFile[]> {
    const files: FeishuFile[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.driveFilesPagination(folderId, {
        ...options,
        pageToken,
      });
      
      files.push(...result.files);
      pageToken = result.next_page_token;
    } while (pageToken);

    return files;
  }

  /**
   * 分页获取知识库空间列表
   * @param options 分页选项
   */
  async wikiSpacesPagination(
    options: PaginationOptions = {}
  ): Promise<FeishuWikiSpacesPagination> {
    const { pageSize = 20, pageToken } = options;
    
    const params: any = {
      page_size: pageSize,
      user_id_type: 'user_id',
    };
    
    if (pageToken) params.page_token = pageToken;

    const response = await this.httpClient.get<FeishuWikiSpacesPagination>(
      '/wiki/v2/spaces',
      { params }
    );
    console.log("wikiSpacesPagination", response);
     return response.data;
  }

  /**
   * 获取所有知识库空间列表
   */
  async wikiSpaces(): Promise<FeishuWikiSpace[]> {
     const spaces: FeishuWikiSpace[] = [];
     let pageToken: string | undefined;
     let hasMore = false;
 
     do {
       const result = await this.wikiSpacesPagination({ pageToken });
       spaces.push(...result.items);
       pageToken = result.page_token;
       hasMore = result.has_more;
     } while (hasMore);
 
     return spaces;
   }

  /**
   * 分页获取知识库空间节点
   * @param spaceId 空间ID
   * @param options 分页和查询选项
   */
  async spaceNodesPagination(
    spaceId: string,
    options: PaginationOptions & WikiNodeQueryOptions = {}
  ): Promise<FeishuWikiNodesPagination> {
    const { pageSize = 50, pageToken, parentNodeToken } = options;
    
    const params: any = {
      space_id: spaceId,
      page_size: pageSize,
      user_id_type: 'user_id',
    };
    
    if (pageToken) params.page_token = pageToken;
    if (parentNodeToken) params.parent_node_token = parentNodeToken;

    const response = await this.httpClient.get<FeishuWikiNodesPagination>(
      `/wiki/v2/spaces/${spaceId}/nodes`,
      { params }
    );

     return response.data;
  }

  /**
   * 获取知识库空间所有节点
   * @param spaceId 空间ID
   * @param options 查询选项
   */
  async spaceNodes(
     spaceId: string,
     options: WikiNodeQueryOptions = {}
   ): Promise<FeishuWikiNode[]> {
     const nodes: FeishuWikiNode[] = [];
     let pageToken: string | undefined;
 
     do {
       const result = await this.spaceNodesPagination(spaceId, {
         ...options,
         pageToken,
       });
       
       nodes.push(...result.items);
       pageToken = result.page_token;
     } while (pageToken);
 
     return nodes;
   }

  /**
   * 创建导出任务
   * @param request 导出任务请求
   */
  async createExportTask(request: ExportTaskRequest): Promise<ExportTaskResponse> {
    const response = await this.httpClient.post<ExportTaskResponse>(
      '/drive/v1/export_tasks',
      request
    );

     return response.data;
  }

  /**
   * 查询导出任务状态
   * @param ticket 任务票据
   */
  async getExportTaskStatus(ticket: string, token: string): Promise<ExportTaskStatus> {
    const response = await this.httpClient.get<ExportTaskStatus>(
      `/drive/v1/export_tasks/${ticket}`,
      {params: {token}}
    );

     return response.data;
  }

  /**
   * 等待导出任务完成
   * @param ticket 任务票据
   * @param maxWaitTime 最大等待时间（秒）
   */
  async waitForExportTask(
    ticket: string,
    token: string,
    maxWaitTime: number = 300
  ): Promise<ExportTaskResult> {
    const startTime = Date.now();
    const maxWaitMs = maxWaitTime * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getExportTaskStatus(ticket, token);
      
      if (status.result?.job_status === 0) {
        // 导出成功，可以立即下载
        return status.result;
      } else if (status.result?.job_status === 1) {
        // 正在初始化，继续等待
        console.log('Export task initializing...');
      } else if (status.result?.job_status === 2) {
        // 正在处理中，继续等待
        console.log('Export task processing...');
      } else {
        // 其他状态表示错误
        throw new Error(`Export task failed with status ${status.result?.job_status}: ${status.result?.job_error_msg || 'Unknown error'}`);
      }
      
      // 等待2秒后重试
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Export task timeout');
  }

  /**
   * 根据文件类型获取默认导出格式
   * @param fileType 文件类型
   */
  getDefaultExtension(fileType: string): string {
    const extensionMap: Record<string, string> = {
      'doc': 'docx',
      'docx': 'docx',
      'sheet': 'xlsx',
      'bitable': 'xlsx',
      'mindnote': 'pdf',
      'slides': 'pptx',
    };
    
    return extensionMap[fileType] || 'pdf';
  }

  /**
   * 下载文件到指定路径
   * @param url 下载URL
   * @param filePath 保存路径
   * @param options 下载选项
   */
  async downloadExportFileToPath(
    fileToken: string,
    filePath: string,
    options: FileDownloadOptions = {}
  ): Promise<void> {
    try {
      // 使用axios下载文件，设置responseType为arraybuffer以处理二进制数据
      const response = await this.httpClient.get(`/drive/v1/export_tasks/file/${fileToken}/download`, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/octet-stream'
        },
        // 对于文件下载，我们不需要经过响应拦截器的API错误处理
        transformResponse: [(data) => data],
      });

      const fileDir = await dirname(filePath);
      const dirExists = await exists(fileDir);
      if (!dirExists) {
        await mkdir(fileDir, { recursive: true });
      }

      const uint8Array = new Uint8Array(response.data);

      // 将二进制数据转换为base64字符串保存
      // const base64String = btoa(String.fromCharCode(...uint8Array));
      // await writeTextFile(filePath + '.base64', base64String);
      await writeFile(filePath, uint8Array);

      if (options.onProgress) {
        options.onProgress({
          task_id: 'download',
          progress: 100,
          completed_files: 1,
          total_files: 1,
          current_file: filePath,
          status: 'completed',
        });
      }
    } catch (error) {
      console.error('Failed to download file:', error);
      if(error instanceof Error) {
        console.error(error.stack);
      }
    }
  }


  /**
   * 下载文件到指定路径
   * @param url 下载URL
   * @param filePath 保存路径
   * @param options 下载选项
   */
  async downloadFileToPath(
     fileToken: string,
     filePath: string,
     options: FileDownloadOptions = {}
   ): Promise<void> {
    try {
      // 使用axios下载文件，设置responseType为arraybuffer以处理二进制数据
      const response = await this.httpClient.get(`/drive/v1/files/${fileToken}/download`, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        // 对于文件下载，我们不需要经过响应拦截器的API错误处理
        transformResponse: [(data) => data],
      });

      const fileDir = await dirname(filePath);
      const dirExists = await exists(fileDir);
      if (!dirExists) {
        await mkdir(fileDir, { recursive: true });
      }

      const uint8Array = new Uint8Array(response.data);
      await writeFile(filePath, uint8Array);
      
      if (options.onProgress) {
          options.onProgress({
            task_id: 'download',
            progress: 100,
            completed_files: 1,
            total_files: 1,
            current_file: filePath,
            status: 'completed',
          });
        }
    } catch (error) {
      console.error('Failed to download file:', error); 
      if (error instanceof Error) {
        console.error(error.stack);
      }
      throw error;
    }
  }
}

export const feishuApi = FeishuApi.getInstance();