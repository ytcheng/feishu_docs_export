import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { fetch } from '@tauri-apps/plugin-http';
import { writeTextFile, readTextFile, exists, create } from '@tauri-apps/plugin-fs';
import type {
  DownloadTask,
  FeishuFile,
  FeishuFolder,
  FeishuWikiSpace,
  FeishuWikiNode,
  ApiResponse,
  TokenInfo,
  DownloadProgressEvent,
  DownloadCompleteEvent,
  DownloadErrorEvent
} from '../types';

/**
 * Tauri API 封装类
 */
export class TauriApi {
  private static instance: TauriApi;
  private tokenExpiredUnlisten: (() => void) | null = null;

  private constructor() {}

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
  async getAccessToken(code: string): Promise<ApiResponse<TokenInfo>> {
    return await invoke('get_access_token', { code });
  }

  /**
   * 刷新访问令牌
   * @param refreshToken 刷新令牌
   */
  async refreshAccessToken(refreshToken: string): Promise<ApiResponse<TokenInfo>> {
    return await invoke('refresh_access_token', { refreshToken });
  }

  /**
   * 获取用户信息
   * @param accessToken 访问令牌
   */
  async getUserInfo(accessToken: string): Promise<ApiResponse> {
    return await invoke('get_user_info', { accessToken });
  }

  /**
   * 获取根文件夹元数据
   * @param accessToken 访问令牌
   */
  async getRootFolderMeta(accessToken: string): Promise<ApiResponse<FeishuFolder>> {
    return await invoke('get_root_folder_meta', { accessToken });
  }

  /**
   * 获取文件夹文件列表
   * @param accessToken 访问令牌
   * @param folderToken 文件夹令牌
   * @param pageSize 页面大小
   */
  async getFolderFiles(
    accessToken: string,
    folderToken?: string,
    pageSize?: number
  ): Promise<ApiResponse<{ files: FeishuFile[]; folders: FeishuFolder[] }>> {
    return await invoke('get_folder_files', { accessToken, folderToken, pageSize });
  }

  /**
   * 获取知识库空间列表
   * @param accessToken 访问令牌
   * @param pageSize 页面大小
   */
  async getWikiSpaces(
    accessToken: string,
    pageSize?: number
  ): Promise<ApiResponse<{ items: FeishuWikiSpace[] }>> {
    return await invoke('get_wiki_spaces', { accessToken, pageSize });
  }

  /**
   * 获取知识库空间节点
   * @param accessToken 访问令牌
   * @param spaceId 空间ID
   * @param parentToken 父节点令牌
   */
  async getWikiSpaceNodes(
    accessToken: string,
    spaceId?: string,
    parentToken?: string
  ): Promise<ApiResponse<{ items: FeishuWikiNode[] }>> {
    return await invoke('get_wiki_space_nodes', { accessToken, spaceId, parentToken });
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
   * @param accessToken 访问令牌
   */
  async executeDownloadTask(taskId: string, accessToken: string): Promise<boolean> {
    return await invoke('execute_download_task', { taskId, accessToken });
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
   * @param accessToken 访问令牌
   */
  async retryDownloadFile(taskId: string, fileToken: string, accessToken: string): Promise<boolean> {
    return await invoke('retry_download_file', { taskId, fileToken, accessToken });
  }

  /**
   * 恢复下载任务
   */
  async resumeDownloadTasks(): Promise<void> {
    return await invoke('resume_download_tasks');
  }

  /**
   * 恢复所有pending状态的下载任务
   */
  async resumePendingDownloadTasks(accessToken: string): Promise<string> {
    return await invoke('resume_pending_download_tasks', { accessToken });
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
    const unlisten = await listen('token-expired', (event) => {
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