/**
 * 数据库操作示例
 * 展示如何使用 TypeScript 版本的数据库操作模块
 */

import { databaseManager, DatabaseError } from '../utils/database';
import {
  DownloadTask,
  FileInfo,
  TaskStatus,
  FileStatus,
  CreateDownloadTaskRequest
} from '../types/database';

/**
 * 数据库操作示例类
 */
export class DatabaseExample {
  /**
   * 初始化数据库示例
   */
  static async initExample(): Promise<void> {
    try {
      console.log('正在初始化数据库...');
      await databaseManager.init();
      console.log('数据库初始化成功！');
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建下载任务示例
   */
  static async createTaskExample(): Promise<DownloadTask> {
    const now = new Date().toISOString();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: DownloadTask = {
      id: taskId,
      name: '飞书文档导出任务',
      description: '导出选中的飞书文档和文件夹',
      status: TaskStatus.PENDING,
      progress: 0,
      totalFiles: 0,
      downloadedFiles: 0,
      failedFiles: 0,
      outputPath: '/Users/username/Downloads/feishu_export',
      createdAt: now,
      updatedAt: now,
      selectedNodes: JSON.stringify({
        nodes: [
          {
            path: ['根目录', '文档文件夹'],
            node: {
              type: 'FeishuFolder',
              fileItem: {
                token: 'folder_token_123',
                name: '重要文档',
                parent_token: 'root_token'
              }
            }
          }
        ]
      })
    };

    try {
      console.log('正在创建下载任务...');
      await databaseManager.createTask(task);
      console.log('下载任务创建成功:', task);
      return task;
    } catch (error) {
      console.error('创建下载任务失败:', error);
      throw error;
    }
  }

  /**
   * 添加文件到任务示例
   */
  static async addFilesExample(taskId: string): Promise<void> {
    const files: FileInfo[] = [
      {
        token: 'file_token_001',
        name: '重要文档.docx',
        type: 'docx',
        relativePath: '重要文档/重要文档.docx',
        spaceId: 'space_123',
        status: FileStatus.PENDING
      },
      {
        token: 'file_token_002',
        name: '项目计划.xlsx',
        type: 'xlsx',
        relativePath: '重要文档/项目计划.xlsx',
        spaceId: 'space_123',
        status: FileStatus.PENDING
      },
      {
        token: 'file_token_003',
        name: '会议纪要.pdf',
        type: 'pdf',
        relativePath: '重要文档/会议纪要.pdf',
        spaceId: 'space_123',
        status: FileStatus.PENDING
      }
    ];

    try {
      console.log('正在添加文件到任务...');
      await databaseManager.createFiles(taskId, files);
      console.log(`成功添加 ${files.length} 个文件到任务`);
    } catch (error) {
      console.error('添加文件失败:', error);
      throw error;
    }
  }

  /**
   * 模拟下载过程示例
   */
  static async simulateDownloadExample(taskId: string): Promise<void> {
    try {
      // 开始下载任务
      console.log('开始下载任务...');
      await databaseManager.updateTaskStatus(taskId, TaskStatus.DOWNLOADING);

      // 获取任务文件列表
      const files = await databaseManager.getTaskFiles(taskId);
      console.log(`任务包含 ${files.length} 个文件`);

      let completedFiles = 0;
      let failedFiles = 0;

      // 模拟下载每个文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`开始下载文件: ${file.name}`);
        
        // 标记文件开始下载
        await databaseManager.updateFileStatus(taskId, file.token, FileStatus.DOWNLOADING);
        
        // 模拟下载延迟
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 随机模拟成功或失败
        const isSuccess = Math.random() > 0.2; // 80% 成功率
        
        if (isSuccess) {
          await databaseManager.updateFileStatus(taskId, file.token, FileStatus.COMPLETED);
          completedFiles++;
          console.log(`文件下载成功: ${file.name}`);
        } else {
          await databaseManager.updateFileStatus(taskId, file.token, FileStatus.FAILED, '网络连接超时');
          failedFiles++;
          console.log(`文件下载失败: ${file.name}`);
        }
        
        // 更新任务进度
        const progress = (completedFiles / files.length) * 100;
        await databaseManager.updateTaskProgress(
          taskId,
          progress,
          completedFiles,
          failedFiles,
          files.length
        );
        
        console.log(`任务进度: ${progress.toFixed(1)}%`);
      }

      // 检查任务是否完成
      if (failedFiles === 0) {
        await databaseManager.updateTaskStatus(taskId, TaskStatus.COMPLETED);
        console.log('所有文件下载成功，任务完成！');
      } else {
        console.log(`任务完成，但有 ${failedFiles} 个文件下载失败`);
      }
      
    } catch (error) {
      console.error('下载过程中发生错误:', error);
      throw error;
    }
  }

  /**
   * 查询任务示例
   */
  static async queryTasksExample(): Promise<void> {
    try {
      console.log('\n=== 查询任务示例 ===');
      
      // 获取所有任务
      const allTasks = await databaseManager.getAllTasks();
      console.log(`总共有 ${allTasks.length} 个任务`);
      
      // 按状态分组显示
       const tasksByStatus: Record<TaskStatus, DownloadTask[]> = {
         [TaskStatus.PENDING]: [],
         [TaskStatus.READY]: [],
         [TaskStatus.DOWNLOADING]: [],
         [TaskStatus.PAUSED]: [],
         [TaskStatus.COMPLETED]: [],
         [TaskStatus.FAILED]: [],
         [TaskStatus.CANCELLED]: []
       };
      
      allTasks.forEach(task => {
        tasksByStatus[task.status].push(task);
      });
      
      Object.entries(tasksByStatus).forEach(([status, tasks]) => {
        if (tasks.length > 0) {
          console.log(`${status}: ${tasks.length} 个任务`);
          tasks.forEach(task => {
            console.log(`  - ${task.name} (${task.progress.toFixed(1)}%)`);
          });
        }
      });
      
    } catch (error) {
      console.error('查询任务失败:', error);
      throw error;
    }
  }

  /**
   * 获取任务详情示例
   */
  static async getTaskDetailExample(taskId: string): Promise<void> {
    try {
      console.log(`\n=== 任务详情: ${taskId} ===`);
      
      const task = await databaseManager.getTask(taskId);
      if (!task) {
        console.log('任务不存在');
        return;
      }
      
      console.log(`任务名称: ${task.name}`);
      console.log(`任务状态: ${task.status}`);
      console.log(`任务进度: ${task.progress.toFixed(1)}%`);
      console.log(`总文件数: ${task.totalFiles}`);
      console.log(`已下载: ${task.downloadedFiles}`);
      console.log(`下载失败: ${task.failedFiles}`);
      console.log(`输出路径: ${task.outputPath}`);
      console.log(`创建时间: ${task.createdAt}`);
      console.log(`更新时间: ${task.updatedAt}`);
      
      // 获取文件统计
      const completedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.COMPLETED);
      const failedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.FAILED);
      const pendingCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.PENDING);
      const downloadingCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.DOWNLOADING);
      
      console.log('\n文件状态统计:');
      console.log(`  已完成: ${completedCount}`);
      console.log(`  下载中: ${downloadingCount}`);
      console.log(`  等待中: ${pendingCount}`);
      console.log(`  失败: ${failedCount}`);
      
    } catch (error) {
      console.error('获取任务详情失败:', error);
      throw error;
    }
  }

  /**
   * 完整示例流程
   */
  static async runCompleteExample(): Promise<void> {
    try {
      console.log('=== 开始完整数据库操作示例 ===\n');
      
      // 1. 初始化数据库
      await this.initExample();
      
      // 2. 创建任务
      const task = await this.createTaskExample();
      const taskId = task.id;
      
      // 3. 添加文件
      await this.addFilesExample(taskId);
      
      // 4. 模拟下载过程
      await this.simulateDownloadExample(taskId);
      
      // 5. 查询任务
      await this.queryTasksExample();
      
      // 6. 获取任务详情
      await this.getTaskDetailExample(taskId);
      
      console.log('\n=== 完整示例执行完成 ===');
      
    } catch (error) {
      console.error('示例执行失败:', error);
      throw error;
    }
  }
}

// 导出便捷函数
export const {
  initExample,
  createTaskExample,
  addFilesExample,
  simulateDownloadExample,
  queryTasksExample,
  getTaskDetailExample,
  runCompleteExample
} = DatabaseExample;