/**
 * 下载进度事件
 */
export interface DownloadProgressEvent {
  task_id: string;
  progress: number;
  completed_files: number;
  total_files: number;
  current_file: string;
  status: string;
}

/**
  * 用户信息接口
  */
export interface UserInfo {
  name: string;
  avatar_url?: string;
  avatar_thumb?: string;
  email?: string;
  user_id?: string;
}

/**
 * 下载任务状态
 */
export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled';

/**
 * 下载任务接口
 */
export interface DownloadTask {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  progress: number;
  totalFiles: number;
  downloadedFiles: number;
  failedFiles: number;
  outputPath: string;
  createdAt: string;
  updatedAt: string;
  sourceType: 'drive' | 'wiki';
  sourceId?: string;
  files?: DownloadFile[];
}

/**
 * 下载文件接口
 */
export interface DownloadFile {
  token: string;
  name: string;
  type: string;
  size?: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  localPath?: string;
  error?: string;
  relativePath?: string;
  spaceId?: string;
}
export interface FeishuFileShortcutInfo{
  target_type: string;
  target_token: string;
}


export interface FeishuRootMeta {
  token: string;
  id: string;
  user_id: string;
}
/**
 * 飞书文件夹接口
 */
export interface FeishuFolder {
  token: string;
  name: string;
  parent_token?: string;
  url?: string;
  created_time?: string;
  modified_time?: string;
}
/**
 * 飞书文件接口
 */
export interface FeishuFile {
  token: string;
  name: string;
  type: string;
  parent_token?: string;
  url?: string;
  shortcut_info?: FeishuFileShortcutInfo,
  created_time?: string;
  modified_time?: string;
  owner_id?: String;
}
export interface FeishuWikiRoot{}
/**
 * 飞书知识库空间接口
 */
export interface FeishuWikiSpace {
  space_id: string;
  name: string;
  description?: string;
  visibility?: string;
  space_type?: string;
  open_sharing?: string;
}

/**
 * 飞书知识库节点接口
 */
export interface FeishuWikiNode {
  space_id: string;
  node_token: string;
  obj_token: string;
  obj_type: string;
  parent_node_token?: string;
  node_type: string;
  origin_node_token?: string;
  origin_space_id?: string;
  has_child?: boolean;
  title: string;
  obj_create_time?: string;
  obj_edit_time?: string;
  node_create_time?: string;
}

/**
 * Token信息接口
 */
export interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * 

/**
 * 下载完成事件
 */
export interface DownloadCompleteEvent {
  taskId: string;
  fileToken?: string;
  localPath?: string;
  message?: string;
}

/**
 * 下载错误事件
 */
export interface DownloadErrorEvent {
  taskId: string;
  fileToken?: string;
  error: string;
  message?: string;
}

/**
 * 全局窗口接口扩展
 */
declare global {
  interface Window {
    __TAURI__?: any;
  }
}