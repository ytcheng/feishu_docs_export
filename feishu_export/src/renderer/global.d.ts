interface UserInfo {
  name: string;
  en_name: string;
  email: string;
  mobile: string;
  avatar_url: string;
  avatar_thumb: string;
  avatar_middle: string;
  avatar_big: string;
  open_id: string;
  union_id: string;
  user_id: string;
  tenant_key: string;
}

interface AuthData {
  access_token: string;
  refresh_token: string;
  user_info: UserInfo;
}

interface DownloadTask {
  id: string;
  name: string;
  savePath: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  totalFiles: number;
  downloadedFiles: number;
  createdAt: string;
  updatedAt: string;
  files: DownloadFile[];
}

interface DownloadFile {
  token: string;
  name: string;
  type: 'folder' | 'file' | 'doc' | 'sheet' | 'mindnote' | 'bitable' | 'docx' | 'shortcut' | 'wiki_root' | 'wiki_space' | 'wiki_node';
  url?: string;
  size?: number;
  relativePath: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  space_id?: string;
  node_type?: string;
  errorMessage?: string; // 错误信息
}

interface ElectronAPI {
  onFeishuAccessToken: (callback: (authData: AuthData) => void) => void;
  onFeishuAuthError: (callback: (error: string) => void) => void;
  openFeishuAuth: (url: string) => Promise<void>;
  getAccessToken: (code: string) => Promise<any>;
  // 云空间 API
  getRootFolderMeta: (accessToken: string) => Promise<any>;
  getFolderFiles: (accessToken: string, folderToken?: string, pageSize?: number) => Promise<any>;
  // 知识库 API
  getWikiSpaces: (accessToken: string, pageSize?: number) => Promise<any>;
  getWikiSpaceNodes: (accessToken: string, spaceId?: string, parentToken?: string) => Promise<any>;
  // 系统 API
  selectDirectory: () => Promise<string | null>;
  openDirectory: (path: string) => Promise<void>;
  // 下载任务 API
  createDownloadTask: (task: Omit<DownloadTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  getDownloadTasks: () => Promise<DownloadTask[]>;
  updateDownloadTask: (id: string, updates: Partial<DownloadTask>) => Promise<void>;
  deleteDownloadTask: (id: string) => Promise<void>;
  executeDownloadTask: (taskId: string, accessToken: string) => Promise<void>;
  retryDownloadFile: (taskId: string, fileToken: string, accessToken: string) => Promise<void>;
  resumeDownloadTasks: () => Promise<{ success: boolean; message: string; count?: number }>;
  // 下载进度监听
  onDownloadProgress: (callback: (data: any) => void) => void;
  onDownloadComplete: (callback: (data: any) => void) => void;
  onDownloadError: (callback: (data: any) => void) => void;
  onDownloadFileError: (callback: (data: any) => void) => void;
  onResumeDownloadTasks: (callback: (data: any) => void) => void;
  onAutoResumeTask: (callback: (data: any) => void) => void;
  removeDownloadListeners: () => void;
  // Token管理相关
  getRefreshToken: () => Promise<string | null>;
  updateTokens: (accessToken: string, refreshToken: string) => Promise<boolean>;
  onTokenExpired: (callback: () => void) => void;
  removeTokenExpiredListener: () => void;
}
declare interface Window {
  electronAPI: ElectronAPI;
}