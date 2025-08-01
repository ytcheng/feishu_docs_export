import Database from '@tauri-apps/plugin-sql';
import {
  DownloadTask,
  DownloadFile,
  TaskStatus,
  FileStatus
} from '../types/database';
import { FileItem } from '../types';

/**
 * 数据库操作类
 * 基于 tauri-plugin-sql 实现的 TypeScript 版本数据库操作
 */
export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = 'sqlite:feishu_docs_export.db') {
    this.dbPath = dbPath;
  }

  /**
   * 初始化数据库连接
   * 注意：表结构由 Rust 端的 tauri-plugin-sql 迁移自动创建
   */
  async init(): Promise<void> {
    try {
      this.db = await Database.load(this.dbPath);
      // 表结构已由 Rust 端迁移处理，无需手动创建
    } catch (error) {
      throw new DatabaseError(`Failed to initialize database: ${error}`);
    }
  }

  /**
   * 创建下载任务
   */
  async createTask(task: DownloadTask): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.execute(
      `INSERT INTO download_tasks (
        name, description, status, progress, total_files,
        downloaded_files, failed_files, output_path, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.name,
        task.description || null,
        task.status,
        task.progress,
        task.totalFiles,
        task.downloadedFiles,
        task.failedFiles,
        task.outputPath,
        task.createdAt,
        task.updatedAt
      ]
    );
    const taskId = result.lastInsertId as number;
    this.createFiles(taskId, task.files || []);
    return taskId;
  }

  /**
   * 获取单个任务
   */
  async getTask(taskId: number): Promise<DownloadTask | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_tasks WHERE id = ?',
      [taskId]
    );

    if (result.length === 0) return null;

    const row = result[0];
    const files = await this.getTaskFiles(taskId);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status as TaskStatus,
      progress: row.progress,
      totalFiles: row.total_files,
      downloadedFiles: row.downloaded_files,
      failedFiles: row.failed_files,
      outputPath: row.output_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      files
    };
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<DownloadTask[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_tasks ORDER BY created_at DESC'
    );

    const tasks: DownloadTask[] = [];
    for (const row of result) {
      const files = await this.getTaskFiles(row.id);
      tasks.push({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as TaskStatus,
        progress: row.progress,
        totalFiles: row.total_files,
        downloadedFiles: row.downloaded_files,
        failedFiles: row.failed_files,
        outputPath: row.output_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        files
      });
    }

    return tasks;
  }

  /**
   * 更新任务
   */
  async updateTask(task: DownloadTask): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute(
      `UPDATE download_tasks SET
        name = ?, description = ?, status = ?, progress = ?,
        total_files = ?, downloaded_files = ?, failed_files = ?,
        output_path = ?, updated_at = ?
      WHERE id = ?`,
      [
        task.name,
        task.description || null,
        task.status,
        task.progress,
        task.totalFiles,
        task.downloadedFiles,
        task.failedFiles,
        task.outputPath,
        task.updatedAt,
        task.id
      ]
    );
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute('DELETE FROM download_tasks WHERE id = ?', [taskId]);
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(
    taskId: number,
    progress: number,
    downloadedFiles: number,
    failedFiles: number,
    totalFiles: number
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE download_tasks SET
        progress = ?, downloaded_files = ?, failed_files = ?,
        total_files = ?, updated_at = ?
      WHERE id = ?`,
      [progress, downloadedFiles, failedFiles, totalFiles, now, taskId]
    );
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: number, status: TaskStatus): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE download_tasks SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, taskId]
    );
  }

  /**
   * 获取自动恢复任务列表（排除当前正在运行的任务）
   */
  async getAutoResumeTasks(): Promise<DownloadTask[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      `SELECT * FROM download_tasks
       WHERE status IN ('downloading', 'pending', 'ready')
       ORDER BY created_at ASC`
    );

    const tasks: DownloadTask[] = [];
    for (const row of result) {
      const files = await this.getTaskFiles(row.id);
      tasks.push({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as TaskStatus,
        progress: row.progress,
        totalFiles: row.total_files,
        downloadedFiles: row.downloaded_files,
        failedFiles: row.failed_files,
        outputPath: row.output_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        files
      });
    }

    return tasks;
  }

  /**
   * 获取可恢复的任务（下载中和暂停状态）
   */
  async getResumableTasks(): Promise<DownloadTask[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      `SELECT * FROM download_tasks
       WHERE status IN ('downloading', 'paused')
       ORDER BY created_at ASC`
    );

    const tasks: DownloadTask[] = [];
    for (const row of result) {
      const files = await this.getTaskFiles(row.id);
      tasks.push({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as TaskStatus,
        progress: row.progress,
        totalFiles: row.total_files,
        downloadedFiles: row.downloaded_files,
        failedFiles: row.failed_files,
        outputPath: row.output_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        files
      });
    }

    return tasks;
  }

  /**
   * 按状态获取任务列表
   */
  async getTasksByStatus(status: TaskStatus): Promise<DownloadTask[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_tasks WHERE status = ? ORDER BY created_at ASC',
      [status]
    );

    const tasks: DownloadTask[] = [];
    for (const row of result) {
      const files = await this.getTaskFiles(row.id);
      tasks.push({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as TaskStatus,
        progress: row.progress,
        totalFiles: row.total_files,
        downloadedFiles: row.downloaded_files,
        failedFiles: row.failed_files,
        outputPath: row.output_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        files
      });
    }

    return tasks;
  }

  // ===== download_files 表操作方法 =====

  /**
   * 创建文件记录
   */
  async createFile(taskId: number, file: DownloadFile): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO download_files (
        parent_id, task_id, name, path, type, is_leaf, is_expanded, file_info,
        status, size, downloaded_size, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        file.parentId,
        taskId,
        file.name,
        file.path,
        file.type,
        file.isLeaf ? 1 : 0,
        file.isExpanded ? 1 : 0,
        file.fileInfo,
        file.status,
        file.size || null,
        file.downloadedSize || null,
        file.error || null,
        now,
        now
      ]
    );
  }

  /**
   * 批量创建文件记录
   */
  async createFiles(taskId: number, files: DownloadFile[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    for (const file of files) {
      await this.createFile(taskId, file);
    }
  }

  /**
   * 获取任务的所有文件
   */
  async getTaskFiles(taskId: number): Promise<DownloadFile[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_files WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );

    return result.map(row => ({
      id: row.id,
      parentId: row.parent_id,
      taskId: row.task_id,
      name: row.name,
      path: row.path,
      type: row.type,
      isLeaf: row.is_leaf,
      isExpanded: row.is_expanded,
      fileInfo: JSON.parse(row.file_info) as FileItem,
      status: row.status as FileStatus,
      size: row.size,
      downloadedSize: row.downloaded_size,
      error: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 更新文件状态
   */
  async updateFileStatus(
    fileId: number,
    status: FileStatus,
    error?: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE download_files SET
        status = ?, error_message = ?, updated_at = ?
      WHERE id = ?`,
      [status, error || null, now, fileId]
    );
  }

  /**
   * 获取任务中指定状态的文件数量
   */
  async getFileCountByStatus(taskId: number, status: FileStatus): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT COUNT(*) as count FROM download_files WHERE task_id = ? AND status = ?',
      [taskId, status]
    );

    return result[0]?.count || 0;
  }

  /**
   * 删除任务的所有文件记录
   */
  async deleteTaskFiles(taskId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute('DELETE FROM download_files WHERE task_id = ?', [taskId]);
  }

  /**
   * 获取未展开的文件夹
   */
  async getUnexpandedFolders(taskId: number): Promise<DownloadFile[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_files WHERE task_id = ? AND is_leaf = 0 AND is_expanded = 0 ORDER BY created_at ASC',
      [taskId]
    );

    return result.map((row) => {
      console.log("getUnexpandedFolders", row);
      return{
        id: row.id,
        parentId: row.parent_id,
        taskId: row.task_id,
        name: row.name,
        path: row.path,
        type: row.type,
        isLeaf: row.is_leaf,
        isExpanded: row.is_expanded,
        fileInfo: JSON.parse(row.file_info) as FileItem,
        status: row.status as FileStatus,
        size: row.size,
        downloadedSize: row.downloaded_size,
        error: row.error_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(taskId: number, path: string, name: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT COUNT(*) as count FROM download_files WHERE task_id = ? AND path = ? AND name = ?',
      [taskId, path, name]
    );

    return (result[0]?.count || 0) > 0;
  }

  /**
   * 标记文件夹为已展开
   */
  async markFolderExpanded(taskId: number, path: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE download_files SET is_expanded = 1, updated_at = ? WHERE task_id = ? AND path = ?',
      [now, taskId, path]
    );
  }

  /**
   * 获取指定数量的未下载文件
   */
  async getPendingFiles(taskId: number, limit: number): Promise<DownloadFile[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.select<any[]>(
      'SELECT * FROM download_files WHERE task_id = ? AND status IN(?, ?) AND type in (?, ?) ORDER BY created_at ASC LIMIT ?',
      [taskId, FileStatus.PENDING, FileStatus.DOWNLOADING, 'FeishuWikiNode', 'FeishuFile', limit]
    );

    return result.map(row => ({
      id: row.id,
      parentId: row.parent_id,
      taskId: row.task_id,
      name: row.name,
      path: row.path,
      type: row.type,
      isLeaf: row.is_leaf,
      isExpanded: row.is_expanded,
      fileInfo: JSON.parse(row.file_info) as FileItem,
      status: row.status as FileStatus,
      size: row.size,
      downloadedSize: row.downloaded_size,
      error: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// 导出单例实例
export const databaseManager = new DatabaseManager();
databaseManager.init();

// 导出错误类
export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}