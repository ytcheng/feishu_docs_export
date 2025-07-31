/**
 * 飞书 API 相关类型定义
 * 基于 Rust 版本的 types.rs 实现
 */

import { FeishuFile, FeishuWikiNode, FeishuWikiSpace } from ".";

/**
 * API 响应结构体
 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

/**
 * API 错误结构体
 */
export interface ApiError {
  code: number;
  msg: string;
}

/**
 * 令牌信息结构体
 */
export interface TokenInfo {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  expires_at?: number;
  refresh_token: string;
  scope: string;
}

/**
 * 用户信息结构体
 */
export interface UserInfo {
  name: string;
  avatar_url?: string;
  avatar_thumb?: string;
  email?: string;
  user_id?: string;
}

/**
 * 根文件夹元数据结构体
 */
export interface FeishuRootMeta {
  name?: string;
  token: string;
  id: string;
  user_id: string;
}

/**
 * 飞书文件快捷方式信息
 */
export interface FeishuFileShortcutInfo {
  target_type: string;
  target_token: string;
}

/**
 * 飞书文件结构体
 */
// export interface FeishuFile {
//   token: string;
//   name: string;
//   type: string;
//   parent_token?: string;
//   url?: string;
//   shortcut_info?: FeishuFileShortcutInfo;
//   created_time?: string;
//   modified_time?: string;
//   owner_id?: string;
// }

/**
 * 飞书文件分页结构体
 */
export interface FeishuFilesPagination {
  files: FeishuFile[];
  next_page_token?: string;
  has_more: boolean;
}

// /**
//  * 飞书知识库根节点
//  */
// export interface FeishuWikiRoot {
//   name: string;
// }

// /**
//  * 飞书文件夹结构体
//  */
// export interface FeishuFolder {
//   token: string;
//   name: string;
//   parent_token?: string;
//   url?: string;
//   created_time?: string;
//   modified_time?: string;
// }

// /**
//  * 飞书知识库空间结构体
//  */
// export interface FeishuWikiSpace {
//   space_id: string;
//   name: string;
//   description?: string;
//   visibility?: string;
//   space_type: string;
//   open_sharing: string;
// }

/**
 * 飞书知识库空间分页结构体
 */
export interface FeishuWikiSpacesPagination {
  items: FeishuWikiSpace[];
  page_token?: string;
  has_more: boolean;
}

// /**
//  * 飞书知识库节点结构体
//  */
// export interface FeishuWikiNode {
//   space_id: string;
//   node_token: string;
//   obj_token: string;
//   obj_type: string;
//   parent_node_token?: string;
//   node_type: string;
//   origin_node_token?: string;
//   origin_space_id?: string;
//   has_child?: boolean;
//   title: string;
//   obj_create_time?: string;
//   obj_edit_time?: string;
//   node_create_time?: string;
//   creator?: string;
//   owner?: string;
//   node_creator?: string;
// }

/**
 * 飞书知识库节点分页结构体
 */
export interface FeishuWikiNodesPagination {
  items: FeishuWikiNode[];
  page_token?: string;
  has_more: boolean;
}

// /**
//  * 飞书树节点联合类型
//  */
// export type FeishuTreeNode = 
//   | { type: 'FeishuRootMeta'; fileItem: FeishuRootMeta }
//   | { type: 'FeishuFile'; fileItem: FeishuFile }
//   | { type: 'FeishuFolder'; fileItem: FeishuFolder }
//   | { type: 'FeishuWikiRoot'; fileItem: FeishuWikiRoot }
//   | { type: 'FeishuWikiSpace'; fileItem: FeishuWikiSpace }
//   | { type: 'FeishuWikiNode'; fileItem: FeishuWikiNode };

/**
 * 飞书树节点包装器
 */
export interface FeishuTreeNodeWrapper {
  path: string[];
  type: string;
  fileItem: any;
}

/**
 * 飞书树结构
 */
export interface FeishuTree {
  nodes: FeishuTreeNodeWrapper[];
}

/**
 * 下载任务结构体
 */
export interface DownloadTask {
  id: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  total_files: number;
  downloaded_files: number;
  failed_files: number;
  output_path: string;
  created_at: string;
  updated_at: string;
  files?: FileInfo[];
  selected_nodes?: FeishuTree;
}

/**
 * 创建下载任务请求结构体
 */
export interface CreateDownloadTaskRequest {
  name: string;
  description?: string;
  outputPath: string;
  selectedNodes: FeishuTree;
}

/**
 * 文件信息结构体
 */
export interface FileInfo {
  token: string;
  name: string;
  type: string;
  relativePath: string;
  spaceId?: string;
  status: string; // pending, downloading, completed, failed
  error?: string;
}

/**
 * 导出任务请求结构体
 */
export interface ExportTaskRequest {
  file_extension: string;
  token: string;
  type: string;
}

/**
 * 导出任务响应结构体
 */
export interface ExportTaskResponse {
  ticket: string;
}

/**
 * 导出任务状态结构体
 */
export interface ExportTaskStatus {
  result?: ExportTaskResult;
}

/**
 * 导出任务结果结构体
 */
export interface ExportTaskResult {
  extra?: any;
  file_extension: string;
  file_name: string;
  file_size: number;
  file_token: string;
  job_error_msg: string;
  job_status: number;
  type: string;
}

/**
 * 下载进度结构体
 */
export interface DownloadProgress {
  task_id: string;
  progress: number;
  completed_files: number;
  total_files: number;
  current_file: string;
  status: string;
}

/**
 * 飞书 API 配置选项
 */
export interface FeishuApiOptions {
  appId: string;
  appSecret: string;
  endpoint?: string; // 默认为 'https://open.feishu.cn/open-apis'
  onLoginExpire?: (message: string) => void;
}

/**
 * 文件下载选项
 */
export interface FileDownloadOptions {
  savePath?: string;
  isExportFile?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * 分页查询选项
 */
export interface PaginationOptions {
  pageSize?: number;
  pageToken?: string;
}

/**
 * 文件查询选项
 */
export interface FileQueryOptions extends PaginationOptions {
  folderToken?: string;
  orderBy?: string;
  direction?: string;
}

/**
 * 知识库节点查询选项
 */
export interface WikiNodeQueryOptions {
  parentNodeToken?: string;
}