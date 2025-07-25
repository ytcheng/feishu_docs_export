// 这里可以暴露 Node API 给渲染进程
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onFeishuAccessToken: (callback: (token: string, userInfo: any) => void) => {
    ipcRenderer.on('feishu-access-token', (event, token: string, userInfo: any) => {
      callback(token, userInfo);
    });
  },
  onFeishuAuthError: (callback: (error: string) => void) => {
    ipcRenderer.on('feishu-auth-error', (event, error: string) => {
      callback(error);
    });
  },
  openFeishuAuth: (url: string) => ipcRenderer.invoke('open-feishu-auth', url),
  getAccessToken: (code: string) => ipcRenderer.invoke('get-access-token', code),
  getRootFolderMeta: (accessToken: string) => ipcRenderer.invoke('get-root-folder-meta', accessToken),
  getFolderFiles: (accessToken: string, folderToken?: string, pageSize?: number) => ipcRenderer.invoke('get-folder-files', accessToken, folderToken, pageSize),
  getWikiSpaces: (accessToken: string, pageSize?: number) => ipcRenderer.invoke('get-wiki-spaces', accessToken, pageSize),
  getWikiSpaceNodes: (accessToken: string, spaceId?: string, parentToken?: string) => ipcRenderer.invoke('get-wiki-space-nodes', accessToken, spaceId, parentToken),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: (path: string) => ipcRenderer.invoke('open-directory', path),
  // 下载任务 API
  createDownloadTask: (task: Omit<DownloadTask, 'id' | 'createdAt' | 'updatedAt'>) => ipcRenderer.invoke('create-download-task', task),
  getDownloadTasks: () => ipcRenderer.invoke('get-download-tasks'),
  updateDownloadTask: (id: string, updates: Partial<DownloadTask>) => ipcRenderer.invoke('update-download-task', id, updates),
  deleteDownloadTask: (id: string) => ipcRenderer.invoke('delete-download-task', id),
  executeDownloadTask: (taskId: string, accessToken: string) => ipcRenderer.invoke('execute-download-task', taskId, accessToken),
  retryDownloadFile: (taskId: string, fileToken: string, accessToken: string) => ipcRenderer.invoke('retry-download-file', taskId, fileToken, accessToken),
  resumeDownloadTasks: () => ipcRenderer.invoke('resume-download-tasks'),
  // 下载进度监听
  onDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onDownloadComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('download-complete', (event, data) => callback(data));
  },
  onDownloadError: (callback: (data: any) => void) => {
    ipcRenderer.on('download-error', (event, data) => callback(data));
  },
  onDownloadFileError: (callback: (data: any) => void) => {
    ipcRenderer.on('download-file-error', (event, data) => callback(data));
  },
  onResumeDownloadTasks: (callback: (data: any) => void) => {
    ipcRenderer.on('resume-download-tasks', (event, data) => callback(data));
  },
  onAutoResumeTask: (callback: (data: any) => void) => {
    ipcRenderer.on('auto-resume-task', (event, data) => callback(data));
  },
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('download-complete');
    ipcRenderer.removeAllListeners('download-error');
    ipcRenderer.removeAllListeners('download-file-error');
  },
  // Token管理相关
  getRefreshToken: () => ipcRenderer.invoke('get-refresh-token'),
  updateTokens: (accessToken: string, refreshToken: string) => ipcRenderer.invoke('update-tokens', accessToken, refreshToken),
  onTokenExpired: (callback: () => void) => {
    ipcRenderer.on('token-expired', () => callback());
  },
  removeTokenExpiredListener: () => {
    ipcRenderer.removeAllListeners('token-expired');
  },
});

window.addEventListener('DOMContentLoaded', () => {
  // 预加载逻辑
});