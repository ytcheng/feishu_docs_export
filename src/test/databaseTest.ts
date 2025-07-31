import { databaseManager } from '../utils/database';
import { TaskStatus, FileStatus, DownloadTask, FileInfo } from '../types/database';

/**
 * 数据库测试模块
 * 用于测试数据库操作的正确性
 */
export class DatabaseTest {
  /**
   * 运行所有测试
   */
  static async runAllTests(): Promise<void> {
    console.log('开始数据库测试...');
    
    try {
      // 初始化数据库
      await databaseManager.init();
      
      await this.testTaskOperations();
      await this.testFileOperations();
      await this.testProgressTracking();
      
      console.log('所有测试通过！');
    } catch (error) {
      console.error('测试失败:', error);
    }
  }
  
  /**
   * 测试任务操作
   */
  static async testTaskOperations(): Promise<void> {
    console.log('测试任务操作...');
    
    // 创建测试任务
    const taskId = 'test-task-' + Date.now();
    const task: DownloadTask = {
      id: taskId,
      name: '测试任务',
      description: '这是一个测试任务',
      status: TaskStatus.PENDING,
      progress: 0,
      totalFiles: 0,
      downloadedFiles: 0,
      failedFiles: 0,
      outputPath: '/test/path',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selectedNodes: JSON.stringify({ type: 'folder', name: 'test' })
    };
    
    await databaseManager.createTask(task);
    console.log('创建任务成功，ID:', taskId);
    
    // 获取任务
    const retrievedTask = await databaseManager.getTask(taskId);
    console.log('获取任务:', retrievedTask?.name);
    
    // 更新任务
    const updatedTask = { ...task, status: TaskStatus.DOWNLOADING, progress: 50 };
    await databaseManager.updateTask(updatedTask);
    
    // 获取所有任务
    const allTasks = await databaseManager.getAllTasks();
    console.log('所有任务数量:', allTasks.length);
    
    // 删除任务
    await databaseManager.deleteTask(taskId);
    console.log('删除任务成功');
  }
  
  /**
   * 测试文件操作
   */
  static async testFileOperations(): Promise<void> {
    console.log('测试文件操作...');
    
    // 创建测试任务
    const taskId = 'test-file-task-' + Date.now();
    const task: DownloadTask = {
      id: taskId,
      name: '文件测试任务',
      description: '用于测试文件操作',
      status: TaskStatus.PENDING,
      progress: 0,
      totalFiles: 0,
      downloadedFiles: 0,
      failedFiles: 0,
      outputPath: '/test/files',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selectedNodes: JSON.stringify({ type: 'folder', name: 'files' })
    };
    
    await databaseManager.createTask(task);
    
    // 添加文件到任务
    const fileInfo: FileInfo = {
      token: 'test-token-123',
      name: 'test-file.txt',
      type: 'file',
      relativePath: '/test/test-file.txt',
      status: FileStatus.PENDING
    };
    
    await databaseManager.createFile(taskId, fileInfo);
    console.log('添加文件成功');
    
    // 获取任务文件
    const files = await databaseManager.getTaskFiles(taskId);
    console.log('任务文件数量:', files.length);
    
    // 更新文件状态
    await databaseManager.updateFileStatus(taskId, fileInfo.token, FileStatus.DOWNLOADING);
    console.log('更新文件状态成功');
    
    // 清理
    await databaseManager.deleteTask(taskId);
  }
  
  /**
   * 测试进度跟踪
   */
  static async testProgressTracking(): Promise<void> {
    console.log('测试进度跟踪...');
    
    // 创建测试任务
    const taskId = 'test-progress-task-' + Date.now();
    const task: DownloadTask = {
      id: taskId,
      name: '进度测试任务',
      description: '用于测试进度跟踪',
      status: TaskStatus.PENDING,
      progress: 0,
      totalFiles: 2,
      downloadedFiles: 0,
      failedFiles: 0,
      outputPath: '/test/progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selectedNodes: JSON.stringify({ type: 'folder', name: 'progress' })
    };
    
    await databaseManager.createTask(task);
    
    // 添加多个文件
    const files: FileInfo[] = [
      {
        token: 'file1',
        name: 'file1.txt',
        type: 'file',
        relativePath: '/file1.txt',
        status: FileStatus.PENDING
      },
      {
        token: 'file2',
        name: 'file2.txt',
        type: 'file',
        relativePath: '/file2.txt',
        status: FileStatus.PENDING
      }
    ];
    
    await databaseManager.createFiles(taskId, files);
    
    // 更新进度
    await databaseManager.updateTaskProgress(taskId, 50, 1, 0, 2);
    
    // 获取更新后的任务
    const updatedTask = await databaseManager.getTask(taskId);
    console.log('任务进度:', updatedTask?.progress);
    
    // 清理
    await databaseManager.deleteTask(taskId);
  }
}

// 如果直接运行此文件，执行测试
if (typeof window === 'undefined') {
  DatabaseTest.runAllTests().catch(console.error);
}