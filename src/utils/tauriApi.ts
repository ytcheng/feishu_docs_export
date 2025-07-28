import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';
import type {
  DownloadTask,
  FeishuFile,
  FeishuWikiSpace,
  FeishuWikiNode,
  TokenInfo,
  UserInfo,
  DownloadProgressEvent,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  FeishuRootMeta,
} from '../types';

/**
 * Tauri API 封装类
 */
export class TauriApi {
  private static instance: TauriApi;
  private tokenExpiredUnlisten: (() => void) | null = null;
  private isRefreshingToken = false;
  private refreshPromise: Promise<boolean> | null = null;

  private constructor() {}

  /**
   * 清除登录状态
   */
  private clearAuthState(): void {
    localStorage.removeItem('feishu_access_token');
    localStorage.removeItem('feishu_refresh_token');
    localStorage.removeItem('feishu_user_info');
    // 可以触发一个事件通知应用程序用户需要重新登录
    window.dispatchEvent(new CustomEvent('auth-expired'));
  }

  /**
   * 尝试刷新访问令牌
   */
  private async tryRefreshToken(): Promise<boolean> {
    if (this.isRefreshingToken && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshingToken = true;
    this.refreshPromise = this.performTokenRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshingToken = false;
      this.refreshPromise = null;
    }
  }

  /**
   * 执行令牌刷新
   */
  private async performTokenRefresh(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('feishu_refresh_token');
      if (!refreshToken) {
        console.warn('没有刷新令牌，无法刷新访问令牌');
        this.clearAuthState();
        return false;
      }

      const tokenInfo = await this.refreshAccessToken(refreshToken);
        // 更新存储的令牌
      localStorage.setItem('feishu_access_token', tokenInfo.access_token);
      if (tokenInfo.refresh_token) {
        localStorage.setItem('feishu_refresh_token', tokenInfo.refresh_token);
        }
        console.log('访问令牌刷新成功');
        return true;
      
    } catch (error) {
      console.error('刷新访问令牌时发生错误:', error);
      this.clearAuthState();
      return false;
    }
  }

  /**
   * 包装API调用，自动处理401错误和令牌刷新
   */
  private async withTokenRefresh<T>(apiCall: (accessToken: string) => Promise<T>, accessToken?: string): Promise<T> {
    // 如果没有提供accessToken，从localStorage获取
    const currentToken = accessToken || localStorage.getItem('feishu_access_token');
    if (!currentToken) {
      throw new Error('未找到访问令牌，请先登录');
    }

    try {
      return await apiCall(currentToken);
    } catch (error: any) {
      console.log('API调用错误:', error);
      // 检查是否是401错误或包含认证失败的信息
      const is401Error = 
        (error?.code === 99991677) ||
        (error?.response?.status === 401) ||
        (error?.message && error.message.includes('401')) ||
        (error?.msg && (error.msg.includes('token') || error.msg.includes('unauthorized')));

      if (is401Error) {
        console.log('检测到401错误，尝试刷新令牌...');
        const refreshSuccess = await this.tryRefreshToken();
        
        if (refreshSuccess) {
          console.log('令牌刷新成功，重试API调用...');
          // 获取刷新后的新token
          const newToken = localStorage.getItem('feishu_access_token');
          if (!newToken) {
            throw new Error('刷新令牌后未找到新的访问令牌');
          }
          // 使用新token重试原始API调用
          return await apiCall(newToken);
        } else {
          console.error('令牌刷新失败，用户需要重新登录');
          throw new Error('认证失败，请重新登录');
        }
      }
      
      // 如果不是401错误，直接抛出原始错误
      throw error;
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TauriApi {
    if (!TauriApi.instance) {
      TauriApi.instance = new TauriApi();
    }
    return TauriApi.instance;
  }

  /**
   * 获取访问令牌
   * @param code 授权码
   */
  async getAccessToken(code: string): Promise<TokenInfo> {
    return await invoke('get_access_token', { code });
  }

  /**
   * 刷新访问令牌
   * @param refreshToken 刷新令牌
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenInfo> {
    return await invoke('refresh_access_token', { refreshToken });
  }

  /**
   * 获取用户信息
   * @param accessToken 访问令牌（可选，如果不提供则从localStorage获取）
   */
  async getUserInfo(accessToken?: string): Promise<UserInfo> {
    return await this.withTokenRefresh((token) => invoke('get_user_info', { accessToken: token }), accessToken);
  }

  /**
   * 获取根文件夹元数据
   * @param accessToken 访问令牌（可选，如果不提供则从localStorage获取）
   */
  async getRootFolderMeta(accessToken?: string): Promise<FeishuRootMeta> {
    return await this.withTokenRefresh((token) => invoke('get_root_folder_meta', { accessToken: token }), accessToken);
  }

  /**
   * 获取文件夹文件列表
   * @param folderToken 文件夹令牌
   * @param pageSize 页面大小
   * @param accessToken 访问令牌（可选，如果不提供则从localStorage获取）
   */
  async getFolderFiles(
    folderToken?: string,
    accessToken?: string
  ): Promise<FeishuFile[]> {
    return await this.withTokenRefresh((token) => invoke('get_folder_files', { accessToken: token, folderToken }), accessToken);
  }

  /**
   * 获取知识库空间列表
   * @param pageSize 页面大小
   * @param accessToken 访问令牌（可选，如果不提供则从localStorage获取）
   */
  async getWikiSpaces(
    accessToken?: string
  ): Promise<FeishuWikiSpace[]> {
    return await this.withTokenRefresh((token) => invoke('get_wiki_spaces', { accessToken: token }), accessToken);
  }

  /**
   * 获取知识库空间节点
   * @param spaceId 空间ID
   * @param parentNodeToken 父节点令牌
   * @param accessToken 访问令牌（可选，如果不提供则从localStorage获取）
   */
  async getWikiSpaceNodes(
    spaceId?: string,
    parentNodeToken?: string,
    accessToken?: string
  ): Promise< FeishuWikiNode[] > {
    return await this.withTokenRefresh((token) => invoke('get_wiki_space_nodes', { accessToken: token, spaceId, parentNodeToken }), accessToken);
  }

  /**
   * 选择目录
   */
  async selectDirectory(): Promise<string | null> {
    const result = await open({
      directory: true,
      multiple: false,
    });
    return result as string | null;
  }

  /**
   * 打开目录
   * @param path 目录路径
   */
  async openDirectory(path: string): Promise<void> {
    await openPath(path);
  }

  /**
   * 创建下载任务
   * @param task 下载任务信息
   */
  async createDownloadTask(task: Omit<DownloadTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<DownloadTask> {
    const result = await invoke('create_download_task', { taskRequest: task }) as any;
    // 转换 Rust 的 snake_case 字段名为 TypeScript 的 camelCase
    return {
      id: result.id,
      name: result.name,
      description: result.description,
      status: result.status,
      progress: result.progress,
      totalFiles: result.total_files,
      downloadedFiles: result.downloaded_files,
      failedFiles: result.failed_files,
      outputPath: result.output_path,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      sourceType: result.source_type,
      sourceId: result.source_id,
      files: result.files
    };
  }

  /**
   * 获取下载任务列表
   */
  async getDownloadTasks(): Promise<DownloadTask[]> {
    const tasks = await invoke('get_download_tasks') as any[];
    // 转换 Rust 的 snake_case 字段名为 TypeScript 的 camelCase
    return tasks.map((task: any) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      progress: task.progress,
      totalFiles: task.total_files,
      downloadedFiles: task.downloaded_files,
      failedFiles: task.failed_files,
      outputPath: task.output_path,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      sourceType: task.source_type,
      sourceId: task.source_id,
      files: task.files
    }));
  }

  /**
   * 更新下载任务
   * @param id 任务ID
   * @param updates 更新内容
   */
  async updateDownloadTask(id: string, updates: Partial<DownloadTask>): Promise<boolean> {
    // 转换 TypeScript 的 camelCase 字段名为 Rust 的 snake_case
    const rustUpdates: any = {};
    if (updates.totalFiles !== undefined) rustUpdates.total_files = updates.totalFiles;
    if (updates.downloadedFiles !== undefined) rustUpdates.downloaded_files = updates.downloadedFiles;
    if (updates.failedFiles !== undefined) rustUpdates.failed_files = updates.failedFiles;
    if (updates.outputPath !== undefined) rustUpdates.output_path = updates.outputPath;
    if (updates.createdAt !== undefined) rustUpdates.created_at = updates.createdAt;
    if (updates.updatedAt !== undefined) rustUpdates.updated_at = updates.updatedAt;
    if (updates.sourceType !== undefined) rustUpdates.source_type = updates.sourceType;
    if (updates.sourceId !== undefined) rustUpdates.source_id = updates.sourceId;
    
    // 复制其他字段
    if (updates.name !== undefined) rustUpdates.name = updates.name;
    if (updates.description !== undefined) rustUpdates.description = updates.description;
    if (updates.status !== undefined) rustUpdates.status = updates.status;
    if (updates.progress !== undefined) rustUpdates.progress = updates.progress;
    if (updates.files !== undefined) rustUpdates.files = updates.files;
    
    return await invoke('update_download_task', { id, updates: rustUpdates });
  }

  /**
   * 删除下载任务
   * @param id 任务ID
   */
  async deleteDownloadTask(id: string): Promise<boolean> {
    return await invoke('delete_download_task', { id });
  }

  /**
   * 执行下载任务
   * @param taskId 任务ID
   * @param accessToken 访问令牌（可选）
   */
  async executeDownloadTask(taskId: string, accessToken?: string): Promise<boolean> {
    return await this.withTokenRefresh((token) => invoke('execute_download_task', { taskId, accessToken: token }), accessToken);
  }

  /**
   * 停止下载任务
   * @param taskId 任务ID
   */
  async stopDownloadTask(taskId: string): Promise<boolean> {
    return await invoke('stop_download_task', { taskId });
  }

  /**
   * 重试下载文件
   * @param taskId 任务ID
   * @param fileToken 文件令牌
   * @param accessToken 访问令牌（可选）
   */
  async retryDownloadFile(taskId: string, fileToken: string, accessToken?: string): Promise<boolean> {
    return await this.withTokenRefresh((token) => invoke('retry_download_file', { taskId, fileToken, accessToken: token }), accessToken);
  }

  /**
   * 恢复下载任务
   * @param accessToken 访问令牌（可选）
   */
  async resumeDownloadTasks(accessToken?: string): Promise<string> {
    return await this.withTokenRefresh((token) => invoke('resume_downloading_tasks', { accessToken: token }), accessToken);
  }

  /**
   * 恢复所有pending状态的下载任务
   * @param accessToken 访问令牌（可选）
   */
  async resumeDownloadingTasks(accessToken?: string): Promise<string> {
    return await this.withTokenRefresh((token) => invoke('resume_downloading_tasks', { accessToken: token }), accessToken);
  }

  /**
   * 手动恢复单个暂停的任务
   * @param taskId 任务ID
   * @param accessToken 访问令牌（可选）
   */
  async resumePausedTask(taskId: string, accessToken?: string): Promise<void> {
    return await this.withTokenRefresh((token) => invoke('resume_paused_task', { taskId, accessToken: token }), accessToken);
  }

  /**
   * 监听下载进度
   * @param callback 回调函数
   */
  async onDownloadProgress(callback: (data: DownloadProgressEvent) => void): Promise<() => void> {
    const unlisten = await listen('download-progress', (event) => {
      callback(event.payload as DownloadProgressEvent);
    });
    return unlisten;
  }

  /**
   * 监听下载完成
   * @param callback 回调函数
   */
  async onDownloadComplete(callback: (data: DownloadCompleteEvent) => void): Promise<() => void> {
    const unlisten = await listen('download-complete', (event) => {
      callback(event.payload as DownloadCompleteEvent);
    });
    return unlisten;
  }

  /**
   * 监听下载错误
   * @param callback 回调函数
   */
  async onDownloadError(callback: (data: DownloadErrorEvent) => void): Promise<() => void> {
    const unlisten = await listen('download-error', (event) => {
      callback(event.payload as DownloadErrorEvent);
    });
    return unlisten;
  }

  /**
   * 监听下载文件错误
   * @param callback 回调函数
   */
  async onDownloadFileError(callback: (data: DownloadErrorEvent) => void): Promise<() => void> {
    const unlisten = await listen('download-file-error', (event) => {
      callback(event.payload as DownloadErrorEvent);
    });
    return unlisten;
  }

  /**
   * 监听恢复下载任务
   * @param callback 回调函数
   */
  async onResumeDownloadTasks(callback: (data: any) => void): Promise<() => void> {
    const unlisten = await listen('resume-download-tasks', (event) => {
      callback(event.payload);
    });
    return unlisten;
  }

  /**
   * 监听自动恢复任务
   * @param callback 回调函数
   */
  async onAutoResumeTask(callback: (data: any) => void): Promise<() => void> {
    const unlisten = await listen('auto-resume-task', (event) => {
      callback(event.payload);
    });
    return unlisten;
  }

  /**
   * 监听Token过期
   * @param callback 回调函数
   */
  async onTokenExpired(callback: () => void): Promise<() => void> {
    const unlisten = await listen('token-expired', (_event) => {
      callback();
    });
    this.tokenExpiredUnlisten = unlisten;
    return unlisten;
  }

  /**
   * 移除Token过期监听器
   */
  removeTokenExpiredListener(): void {
    if (this.tokenExpiredUnlisten) {
      this.tokenExpiredUnlisten();
      this.tokenExpiredUnlisten = null;
    }
  }

  // 注意：事件监听器现在返回取消监听的函数
  // 使用方式：const unlisten = await tauriApi.onDownloadProgress(callback);
  // 取消监听：unlisten();
}

// 导出单例实例
export const tauriApi = TauriApi.getInstance();