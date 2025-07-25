import { invoke } from '@tauri-apps/api/core';
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
  private downloadListeners: Map<string, Function[]> = new Map();

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
    return await invoke('create_download_task', { taskRequest: task });
  }

  /**
   * 获取下载任务列表
   */
  async getDownloadTasks(): Promise<DownloadTask[]> {
    return await invoke('get_download_tasks');
  }

  /**
   * 更新下载任务
   * @param id 任务ID
   * @param updates 更新内容
   */
  async updateDownloadTask(id: string, updates: Partial<DownloadTask>): Promise<boolean> {
    return await invoke('update_download_task', { id, updates });
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
   * 监听下载进度
   * @param callback 回调函数
   */
  onDownloadProgress(callback: (data: DownloadProgressEvent) => void): void {
    this.addEventListener('download-progress', callback);
  }

  /**
   * 监听下载完成
   * @param callback 回调函数
   */
  onDownloadComplete(callback: (data: DownloadCompleteEvent) => void): void {
    this.addEventListener('download-complete', callback);
  }

  /**
   * 监听下载错误
   * @param callback 回调函数
   */
  onDownloadError(callback: (data: DownloadErrorEvent) => void): void {
    this.addEventListener('download-error', callback);
  }

  /**
   * 监听下载文件错误
   * @param callback 回调函数
   */
  onDownloadFileError(callback: (data: DownloadErrorEvent) => void): void {
    this.addEventListener('download-file-error', callback);
  }

  /**
   * 监听恢复下载任务
   * @param callback 回调函数
   */
  onResumeDownloadTasks(callback: (data: any) => void): void {
    this.addEventListener('resume-download-tasks', callback);
  }

  /**
   * 监听自动恢复任务
   * @param callback 回调函数
   */
  onAutoResumeTask(callback: (data: any) => void): void {
    this.addEventListener('auto-resume-task', callback);
  }

  /**
   * 监听Token过期
   * @param callback 回调函数
   */
  onTokenExpired(callback: () => void): void {
    this.addEventListener('token-expired', callback);
  }

  /**
   * 移除下载监听器
   */
  removeDownloadListeners(): void {
    this.removeEventListener('download-progress');
    this.removeEventListener('download-complete');
    this.removeEventListener('download-error');
    this.removeEventListener('download-file-error');
  }

  /**
   * 移除Token过期监听器
   */
  removeTokenExpiredListener(): void {
    this.removeEventListener('token-expired');
  }

  /**
   * 添加事件监听器
   * @param event 事件名称
   * @param callback 回调函数
   */
  private addEventListener(event: string, callback: Function): void {
    if (!this.downloadListeners.has(event)) {
      this.downloadListeners.set(event, []);
    }
    this.downloadListeners.get(event)!.push(callback);
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   */
  private removeEventListener(event: string): void {
    this.downloadListeners.delete(event);
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  private emit(event: string, data: any): void {
    const listeners = this.downloadListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

// 导出单例实例
export const tauriApi = TauriApi.getInstance();