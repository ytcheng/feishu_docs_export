/**
 * 数据库相关类型定义
 */

import { FileItem, NodeType } from ".";

/**
 * 下载任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  READY = 'ready',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 文件状态枚举
 */
export enum FileStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 文件信息接口
 */
export interface DownloadFile {
  id?: number;
  parentId?: number;
  taskId?: number;
  name: string;
  path: string;
  status: FileStatus;
  type: NodeType;
  isLeaf: boolean;
  isExpanded: boolean;
  fileInfo: FileItem;
  size?: number;
  downloadedSize?: number;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
}

/**
 * 下载任务接口
 */
export interface DownloadTask {
  id?: number;
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
  files?: DownloadFile[];
}

/**
 * 创建下载任务请求接口
 */
export interface CreateDownloadTaskRequest {
  name: string;
  description?: string;
  outputPath: string;
  selectedNodes: any; // FeishuTree type
}

/**
 * 数据库查询结果接口
 */
export interface QueryResult<T = any> {
  rows: T[];
  rowsAffected: number;
  lastInsertId?: number;
}