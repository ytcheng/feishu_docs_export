import { databaseManager } from './database';
import { feishuApi } from './feishuApi';
import {
  FeishuFile,
  FeishuFolder,
  FeishuWikiSpace,
  FeishuWikiNode,
  FeishuRootMeta
} from '../types';
import {
  DownloadTask,
  DownloadFile,
  TaskStatus,
  FileStatus
} from '../types/database';
import { emit } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import { FilesDiscoveredEvent } from '../types/event';

/**
 * API错误接口
 */
interface ApiError {
  code: number;
  msg: string;
}

/**
 * 活动下载任务管理器
 */
class ActiveDownloadsManager {
  private activeDownloads: Map<number, AbortController> = new Map();

  add(taskId: number, controller: AbortController): void {
    this.activeDownloads.set(taskId, controller);
  }

  remove(taskId: number): AbortController | undefined {
    const controller = this.activeDownloads.get(taskId);
    this.activeDownloads.delete(taskId);
    return controller;
  }

  has(taskId: number): boolean {
    return this.activeDownloads.has(taskId);
  }

  isAborted(taskId: number): boolean {
    const controller = this.activeDownloads.get(taskId);
    if(!controller) {
      console.log("ActiveDownloadsManager isAborted", true)
      return true;
    }
    console.log("ActiveDownloadsManager isAborted", controller?.signal.aborted || false)
    return controller?.signal.aborted || false;
  }

  stopAll(): void {
    for (const [_taskId, controller] of this.activeDownloads) {
      controller.abort();
    }
    this.activeDownloads.clear();
  }
}

// 全局活动下载管理器
const activeDownloadsManager = new ActiveDownloadsManager();
/**
 * 发现任务文件（循环实现）
 * 循环查找isLeaf为false且isExpanded为false的记录，获取其一级子文件并插入数据库
 */
export async function discoverTaskFiles(taskId: number): Promise<void> {
  try {
    while (true) {
      // 检查任务是否被取消
      if (activeDownloadsManager.isAborted(taskId)) {
        console.log(`发现任务 ${taskId} 已被取消，停止文件发现循环`);
        return;
      }
      
      // 查找需要展开的文件夹（isLeaf=false且isExpanded=false）
      const unexpandedFolders = await databaseManager.getUnexpandedFolders(taskId);
      console.log("discoverTaskFiles unexpandedFolders", unexpandedFolders);
      
      if (unexpandedFolders.length === 0) {
        console.log('所有文件夹已展开完成');
        break;
      }
      
      console.log(`发现 ${unexpandedFolders.length} 个未展开的文件夹`);
      
      for (const folder of unexpandedFolders) {
        // 再次检查任务是否被取消
        if (activeDownloadsManager.isAborted(taskId)) {
          console.log(`发现任务 ${taskId} 已被取消，停止文件夹展开`);
          return;
        }
        
        try {
          const childFiles = await getChildFiles(folder);
          
          if (childFiles.length > 0) {
            // 检查重复并插入新文件
            const newFiles: DownloadFile[] = [];
            
            for (const childFile of childFiles) {
              const exists = await databaseManager.fileExists(
                 taskId,
                 childFile.path,
                 childFile.name
               );
              
              if (!exists) {
                newFiles.push(childFile);
              }
            }
            
            if (newFiles.length > 0) {
              await databaseManager.createFiles(taskId, newFiles);
              console.log(`为文件夹 ${folder.name} 添加了 ${newFiles.length} 个子文件`);
              
              // 发送文件发现事件
              await emit('files-discovered', {
                task_id: taskId,
                new_files: newFiles
              } as FilesDiscoveredEvent);
              
              // 更新任务统计数据
              await updateTaskStatistics(taskId);
            }
          }
          
          // 标记文件夹为已展开
          await databaseManager.markFolderExpanded(taskId, folder.path);
          
        } catch (error) {
          console.error(`展开文件夹 ${folder.name} 失败:`, error);
          // 标记为已展开以避免无限循环
          await databaseManager.markFolderExpanded(taskId, folder.path);
        }
      }
    }
  } catch (error) {
    throw {
      code: -1,
      msg: `发现任务文件失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 获取文件夹的一级子文件
 */
async function getChildFiles(folder: DownloadFile): Promise<DownloadFile[]> {
  const childFiles: DownloadFile[] = [];
  
  
  try {
    switch (folder.type) {
      case 'FeishuRootMeta': {
        const folderToken = (folder.fileInfo as FeishuRootMeta).token;
        console.log("getChildFiles FeishuRootMeta folderToken", folderToken);
        const driveFiles = await feishuApi.driveFiles(folderToken);
        
        for (const file of driveFiles) {
          childFiles.push(createDownloadFileFromDriveFile(
            file,
            folder.taskId!,
            folder.path,
            folder.id
          ));
        }
        break;
      }
      
      case 'FeishuFolder': {
        const folderToken = (folder.fileInfo as FeishuFolder).token;
        console.log("getChildFiles FeishuFolder folderToken", folderToken);
        const driveFiles = await feishuApi.driveFiles(folderToken);
        
        for (const file of driveFiles) {
          childFiles.push(createDownloadFileFromDriveFile(
            file,
            folder.taskId!,
            `${folder.path}/${folder.name}`,
            folder.id
          ));
        }
        break;
      }
      
      case 'FeishuWikiSpace': {
        const spaceId = (folder.fileInfo as FeishuWikiSpace).space_id;
        console.log("getChildFiles FeishuWikiSpace spaceId", spaceId);
        const wikiNodes = await feishuApi.spaceNodes(spaceId);
        
        for (const node of wikiNodes) {
          childFiles.push(createDownloadFileFromWikiNode(
            node,
            folder.taskId!,
            `${folder.path}/${folder.name}`,
            folder.id
          ));
        }
        break;
      }
      
      case 'FeishuWikiNode': {
        const folderToken = (folder.fileInfo as FeishuWikiNode).node_token;
        const wikiNode = folder.fileInfo as any;
        console.log("getChildFiles FeishuWikiNode folderToken", folderToken, "space_id", wikiNode.space_id);
        if (wikiNode.has_child) {
          const childNodes = await feishuApi.spaceNodes(
            wikiNode.space_id,
            { parentNodeToken: folderToken }
          );
          
          for (const node of childNodes) {
            childFiles.push(createDownloadFileFromWikiNode(
              node,
              folder.taskId!,
              `${folder.path}/${folder.name}`,
              folder.id
            ));
          }
        }
        break;
      }
      
      case 'FeishuWikiRoot': {
        const wikiSpaces = await feishuApi.wikiSpaces();
        
        for (const space of wikiSpaces) {
          childFiles.push({
            id: 0,
            parentId: folder.id,
            taskId: folder.taskId!,
            name: space.name,
            path: `${folder.path}/${folder.name}`,
            type: 'FeishuWikiSpace',
            isLeaf: false,
            isExpanded: false,
            fileInfo: {
            space_id: space.space_id,
            name: space.name,
            description: space.description,
            visibility: space.visibility,
            space_type: space.space_type,
            open_sharing: space.open_sharing
          } as FeishuWikiSpace,
            status: FileStatus.PENDING,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error(`获取文件夹 ${folder.name} 的子文件失败:`, error);
  }
  
  return childFiles;
}

/**
 * 从云盘文件创建DownloadFile
 */
function createDownloadFileFromDriveFile(
  file: any,
  taskId: number,
  parentPath: string,
  parentId?: number
): DownloadFile {
  const isLeaf = file.type !== 'folder';
  
  return {
    id: 0,
    parentId,
    taskId,
    name: file.name,
    path: parentPath,
    type: file.type === 'folder' ? 'FeishuFolder' : 'FeishuFile',
    isLeaf,
    isExpanded: false,
    fileInfo: {
      token: file.token,
      name: file.name,
      type: file.type,
      parent_token: file.parent_token,
      url: file.url,
      shortcut_info: file.shortcut_info,
      created_time: file.created_time,
      modified_time: file.modified_time,
      owner_id: file.owner_id
    } as FeishuFile,
    status: FileStatus.PENDING,
    size: file.size,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 从Wiki节点创建DownloadFile
 */
function createDownloadFileFromWikiNode(
  node: any,
  taskId: number,
  parentPath: string,
  parentId?: number
): DownloadFile {
  const isLeaf = !node.has_child && ['doc', 'docx', 'sheet', 'bitable', 'mindnote', 'file', 'slides'].includes(node.obj_type);
  
  return {
    id: 0,
    parentId,
    taskId,
    name: node.title,
    path: parentPath,
    type: 'FeishuWikiNode',
    isLeaf,
    isExpanded: false,
    fileInfo: {
      space_id: node.space_id,
      node_token: node.node_token,
      obj_token: node.obj_token,
      obj_type: node.obj_type,
      parent_node_token: node.parent_node_token,
      node_type: node.node_type,
      origin_node_token: node.origin_node_token,
      origin_space_id: node.origin_space_id,
      has_child: node.has_child,
      title: node.title,
      obj_create_time: node.obj_create_time,
      obj_edit_time: node.obj_edit_time,
      node_create_time: node.node_create_time
    } as FeishuWikiNode,
    status: FileStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 创建下载任务
 */
export async function createDownloadTask(
    newTask: DownloadTask
): Promise<DownloadTask> {
  try {
    
    const taskId = await databaseManager.createTask(newTask);
    newTask.id = taskId;
    return newTask;
  } catch (error) {
    throw {
      code: -1,
      msg: `创建任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 获取下载任务列表
 */
export async function getDownloadTasks(): Promise<DownloadTask[]> {
  try {
    return await databaseManager.getAllTasks();
  } catch (error) {
    throw {
      code: -1,
      msg: `获取任务列表失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 获取任务的文件列表
 */
export async function getTaskFiles(taskId: string): Promise<DownloadFile[]> {
  try {
    return await databaseManager.getTaskFiles(parseInt(taskId));
  } catch (error) {
    throw {
      code: -1,
      msg: `获取任务文件列表失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 获取任务的文件列表（按数字ID）
 */
export async function getTaskFilesByNumericId(taskId: number): Promise<DownloadFile[]> {
  try {
    return await databaseManager.getTaskFiles(taskId);
  } catch (error) {
    throw {
      code: -1,
      msg: `获取任务文件列表失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 更新下载任务
 */
export async function updateDownloadTask(
  taskId: string,
  updates: Partial<DownloadTask>
): Promise<boolean> {
  try {
    const task = await databaseManager.getTask(parseInt(taskId));
    if (!task) {
      return false;
    }
    
    const updatedTask: DownloadTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await databaseManager.updateTask(updatedTask);
    
    return true;
  } catch (error) {
    throw {
      code: -1,
      msg: `更新任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 删除下载任务
 */
export async function deleteDownloadTask(id: number): Promise<boolean> {
  try {
    console.log('删除任务:', id);
    
    const controller = activeDownloadsManager.remove(id);
    
    if (controller) {
      console.log(`任务 ${id} 正在运行，先停止任务`);
      controller.abort();
      await databaseManager.updateTaskStatus(id, TaskStatus.PAUSED);
      console.log(`任务 ${id} 已停止`);
    }
    
    await databaseManager.deleteTask(id);
    
    console.log(`任务 ${id} 删除成功`);
    return true;
  } catch (error) {
    throw {
      code: -1,
      msg: `删除任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 执行下载任务
 */
export async function executeDownloadTask(taskId: number): Promise<boolean> {
  try {
    console.log('开始执行下载任务:', taskId);
    
    const task = await databaseManager.getTask(taskId);
    if (!task) {
      throw {
        code: -1,
        msg: `任务 ${taskId} 不存在`
      } as ApiError;
    }
    
    await startDownloadTask(taskId);
    
    return true;
  } catch (error) {
    throw {
      code: -1,
      msg: `执行下载任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}



/**
 * 重试下载文件
 * @param file 要重试下载的文件对象
 * @returns 是否成功开始重试
 */
/**
 * 重试下载文件
 * @param file 要重试下载的文件对象
 * @returns 是否成功
 */
export async function retryDownloadFile(file: DownloadFile): Promise<boolean> {
  console.log('重试下载文件:', file.name, 'in task', file.taskId);
  
  // 获取任务信息
  const task = await databaseManager.getTask(file.taskId!);
  if (!task) {
    console.error('任务不存在:', file.taskId);
    return false;
  }

  // 检查文件状态，只重试失败的文件
  if (file.status !== FileStatus.FAILED) {
    console.log(`文件 ${file.name} 状态为 ${file.status}，无需重试`);
    return true;
  }

  console.log(`开始重试下载文件: ${file.name}`);
  
  // 重置文件状态为下载中
  await databaseManager.updateFileStatus(file.id!, FileStatus.DOWNLOADING);
  await emit('file-status-changed', {
    task_id: file.taskId!,
    file_id: file.id!,
    file_name: file.name,
    status: FileStatus.DOWNLOADING
  });

  // 重新下载文件 - 这里是唯一可能抛出错误的地方
  let success = false;
  let errorMessage: string | undefined;
  
  try {
    success = await downloadFile(file, task.outputPath);
    if (!success) {
      errorMessage = '重试下载失败';
    }
  } catch (error) {
    console.error(`下载文件 ${file.name} 抛出异常:`, error);
    success = false;
    errorMessage = error instanceof Error ? error.message : '下载过程中发生异常';
  }
  
  // 根据下载结果更新文件状态
  const newStatus = success ? FileStatus.COMPLETED : FileStatus.FAILED;
  
  await databaseManager.updateFileStatus(file.id!, newStatus, errorMessage);
  await emit('file-status-changed', {
    task_id: file.taskId!,
    file_id: file.id!,
    file_name: file.name,
    status: newStatus,
    error: errorMessage
  });
  
  console.log(`文件 ${file.name} 重试下载${success ? '成功' : '失败'}${errorMessage ? ': ' + errorMessage : ''}`);

  // 更新任务进度
  await updateTaskProgress(file.taskId!);
  
  return success;
}

/**
 * 将任务中所有失败的文件状态重置为待下载
 * @param taskId - 任务ID
 * @returns Promise<void>
 */
export async function resetFailedFilesToPending(taskId: number): Promise<void> {
  try {
    console.log('重置任务失败文件状态为待下载:', taskId);
    
    // 获取任务中所有失败的文件
    const files = await databaseManager.getTaskFiles(taskId);
    const failedFiles = files.filter(file => file.status === FileStatus.FAILED);
    
    if (failedFiles.length === 0) {
      console.log('没有失败的文件需要重置');
      return;
    }
    
    console.log(`找到 ${failedFiles.length} 个失败文件，正在重置状态...`);
    
    // 批量更新失败文件状态为待下载
    for (const file of failedFiles) {
      await databaseManager.updateFileStatus(file.id!, FileStatus.PENDING);
      await emit('file-status-changed', {
        task_id: taskId,
        file_id: file.id!,
        file_name: file.name,
        status: FileStatus.PENDING
      });
    }
    
    console.log('失败文件状态重置完成');
  } catch (error) {
    console.error('重置失败文件状态失败:', error);
    throw error;
  }
}

/**
 * 开始下载任务
 */
export async function startDownloadTask(taskId: number): Promise<void> {
  try {
    console.log('开始下载任务:', taskId);
    
    const task = await databaseManager.getTask(taskId);
    if (!task) {
      throw {
        code: -1,
        msg: '任务不存在2'
      } as ApiError;
    }
    
    // 只有当任务状态为DOWNLOADING且已经在activeDownloadsManager中时才抛出错误
    if (task.status === TaskStatus.DOWNLOADING && activeDownloadsManager.has(taskId)) {
      throw {
        code: -1,
        msg: '任务已在下载中'
      } as ApiError;
    }
    
    if (task.status === TaskStatus.COMPLETED) {
      throw {
        code: -1,
        msg: '任务已完成'
      } as ApiError;
    }

    // 更新任务状态为下载中
    await databaseManager.updateTaskStatus(taskId, TaskStatus.DOWNLOADING);
    
    // 创建AbortController用于取消任务
    const abortController = new AbortController();
    activeDownloadsManager.add(taskId, abortController);
    
    try {
      // 启动文件发现和下载的并行处理
      await Promise.all([
        discoverTaskFiles(taskId), // 文件发现循环
        downloadTaskFiles(taskId)  // 文件下载循环
      ]);
    } catch (error) {
      // 如果是取消操作，不抛出错误
      if (abortController.signal.aborted) {
        console.log(`任务 ${taskId} 已被取消`);
        return;
      }
      throw error;
    } finally {
      // 清理AbortController
      activeDownloadsManager.remove(taskId);
    }
  } catch (error) {
    throw {
      code: -1,
      msg: `开始下载任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 下载任务文件的循环处理
 */
async function downloadTaskFiles(taskId: number): Promise<void> {
  const BATCH_SIZE = 5; // 每次下载的文件数量
  const WAIT_TIME = 1000; // 等待时间（毫秒）

  while (true) {
    // 检查任务是否被取消
    if (activeDownloadsManager.isAborted(taskId)) {
      console.log(`下载任务 ${taskId} 已被取消，停止文件下载循环`);
      return;
    }
    
    // 获取一批待下载的文件
    const pendingFiles = await databaseManager.getPendingFiles(taskId, BATCH_SIZE);
    console.log("downloadTaskFiles pendingFiles.length", pendingFiles.length);
    if (pendingFiles.length > 0) {
      // 有待下载文件，执行下载
      await downloadFileBatch(taskId, pendingFiles);
    } else {
      // 没有待下载文件，检查是否还有未展开的文件夹
      const unexpandedFolders = await databaseManager.getUnexpandedFolders(taskId);
      console.log("downloadTaskFiles unexpandedFolders.length", unexpandedFolders.length);
      
      if (unexpandedFolders.length === 0) {
        // 没有未展开的文件夹，说明所有文件都已处理完成
        await finalizeTask(taskId);
        break;
      } else {
        // 还有未展开的文件夹，等待文件发现完成
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
      }
    }
  }
}

/**
 * 下载一批文件
 */
async function downloadFileBatch(taskId: number, files: DownloadFile[]): Promise<void> {
  const task = await databaseManager.getTask(taskId);
  if (!task) return;

  for (const file of files) {
    try {
      if (activeDownloadsManager.isAborted(taskId)) {
        console.log(`下载任务 ${taskId} 已被取消，停止文件下载循环`);
        return;
      }
      // 更新文件状态为下载中
      await databaseManager.updateFileStatus(
        file.id!,
        FileStatus.DOWNLOADING
      );
       
      // 发送文件状态变化事件
      await emit('file-status-changed', {
        task_id: taskId,
        file_id: file.id!,
        file_name: file.name,
        status: FileStatus.DOWNLOADING
      });

      // 执行文件下载
      await downloadFile(file, task.outputPath);

      // 更新文件状态为已完成
      await databaseManager.updateFileStatus(
        file.id!,
        FileStatus.COMPLETED
      );
       
      // 发送文件状态变化事件
      await emit('file-status-changed', {
        task_id: taskId,
        file_id: file.id!,
        file_name: file.name,
        status: FileStatus.COMPLETED
      });

      // 发送进度更新事件
      await updateTaskProgress(taskId);

    } catch (error) {
      console.error(`Error downloading file ${file.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await databaseManager.updateFileStatus(
        file.id!,
        FileStatus.FAILED,
        errorMessage
      );
       
      // 发送文件状态变化事件
      await emit('file-status-changed', {
        task_id: taskId,
        file_id: file.id!,
        file_name: file.name,
        status: FileStatus.FAILED,
        error: errorMessage
      });
    }
  }
}

/**
 * 更新任务统计数据
 */
async function updateTaskStatistics(taskId: number): Promise<void> {
  const completedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.COMPLETED);
  const failedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.FAILED);
  const totalFiles = await databaseManager.getTaskFiles(taskId).then(files => files.length);
  
  const progress = totalFiles > 0 ? ((completedCount + failedCount) / totalFiles) * 100 : 0;
  
  await databaseManager.updateTaskProgress(
    taskId,
    progress,
    completedCount,
    failedCount,
    totalFiles
  );
  
  console.log(`任务 ${taskId} 统计更新: 总文件 ${totalFiles}, 已完成 ${completedCount}, 失败 ${failedCount}, 进度 ${progress.toFixed(2)}%`);
}

/**
 * 更新任务进度
 */
async function updateTaskProgress(taskId: number): Promise<void> {
  const completedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.COMPLETED);
  const failedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.FAILED);
  const totalFiles = await databaseManager.getTaskFiles(taskId).then(files => files.filter(f => f.type === 'FeishuWikiNode' || f.type === 'FeishuFile').length);

  const progress = totalFiles > 0 ? ((completedCount + failedCount) / totalFiles) * 100 : 0;

  await databaseManager.updateTaskProgress(
    taskId,
    progress,
    completedCount,
    failedCount,
    totalFiles
  );

  // 发送进度更新事件
  await emit('download-progress', {
    task_id: taskId,
    progress,
    completed_files: completedCount,
    total_files: totalFiles,
    current_file: '',
    status: TaskStatus.DOWNLOADING
  });
}

/**
 * 完成任务处理
 */
async function finalizeTask(taskId: number): Promise<void> {
  const completedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.COMPLETED);
  const failedCount = await databaseManager.getFileCountByStatus(taskId, FileStatus.FAILED);
  const totalFiles = await databaseManager.getTaskFiles(taskId).then(files => files.length);

  // 确定最终状态
  const finalStatus = failedCount > 0 ? TaskStatus.FAILED : TaskStatus.COMPLETED;
  await databaseManager.updateTaskStatus(taskId, finalStatus);

  // 发送最终进度事件
  await emit('download-progress', {
    task_id: taskId,
    progress: 100.0,
    completed_files: completedCount,
    total_files: totalFiles,
    current_file: '',
    status: finalStatus,
    error: '部分文件下载失败'
  });
}

/**
 * 下载单个文件
 */
async function downloadFile(file: DownloadFile, outputPath: string): Promise<boolean> {
  console.log('downloadFile', file);
  let fileType: string;
  let fileToken: string;
  
  // 根据文件类型获取真正的文件类型和token
  if (file.type === 'FeishuFile') {
    const fileInfo = file.fileInfo as FeishuFile;
    
    // 处理快捷方式
    if (fileInfo.type === 'shortcut' && fileInfo.shortcut_info) {
      fileType = fileInfo.shortcut_info.target_type;
      fileToken = fileInfo.shortcut_info.target_token;
    } else {
      fileType = fileInfo.type;
      fileToken = fileInfo.token;
    }
  } else if (file.type === 'FeishuWikiNode') {
    const fileInfo = file.fileInfo as FeishuWikiNode;
    fileType = fileInfo.obj_type;
    fileToken = fileInfo.obj_token;
  } else {
    throw new Error(`不支持的文件类型: ${file.type}`);
  }
  
  // 根据文件类型进行下载
  if (fileType === 'file') {
    // 直接下载文件
    const filePath = await join(outputPath, file.path, file.name);
    await feishuApi.downloadFileToPath(fileToken, filePath);
    return true;
  } else if (['doc', 'docx', 'sheet', 'bitable'].includes(fileType)) {
    // 需要先导出再下载的文件类型
    const exportTask = await feishuApi.createExportTask({
      token: fileToken,
      file_extension: getDefaultExtension(fileType),
      type: fileType
    });
    
      const exportResult = await feishuApi.waitForExportTask(exportTask.ticket, fileToken);
    
    const extension = getDefaultExtension(fileType);
    const fileName = `${file.name}.${extension}`;
    const filePath = await join(outputPath, file.path, fileName);
    
    await feishuApi.downloadExportFileToPath(exportResult.file_token, filePath);
    
    return true;
  } else {
    throw new Error(`不支持的文件类型: ${fileType}`);
  }
}

/**
 * 恢复所有下载中状态的任务
 */
export async function resumeDownloadingTasks(): Promise<string> {
  try {
    console.log('恢复所有下载中状态的任务');
    
    const downloadingTasks = await databaseManager.getAutoResumeTasks();
    
    if (downloadingTasks.length === 0) {
      console.log('没有下载中状态的任务');
      return '没有需要恢复的任务';
    }
    
    const tasksToResume = downloadingTasks.filter(task => !activeDownloadsManager.has(task.id!));
    
    if (tasksToResume.length === 0) {
      console.log('所有下载中状态的任务都已在运行，无需恢复');
      return '所有任务都已在运行';
    }
    
    let resumedCount = 0;
    console.log(`找到 ${tasksToResume.length} 个需要恢复的任务`);
    
    for (const task of tasksToResume) {
      const taskId = task.id!;
      const taskName = task.name;
      
      console.log(`恢复下载任务: ${taskId} - ${taskName}`);
      
      try {
        await startDownloadTask(task.id!);
        resumedCount++;
      } catch (error) {
        console.log(`恢复任务 ${taskId} 失败:`, error);
      }
    }
    
    return `成功恢复 ${resumedCount} 个下载任务`;
  } catch (error) {
    throw {
      code: -1,
      msg: `恢复下载任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 手动恢复单个暂停的任务
 */
export async function resumePausedTask(taskId: number): Promise<void> {
  try {
    console.log('手动恢复暂停的任务:', taskId);
    
    const task = await databaseManager.getTask(taskId);
    if (!task) {
      throw {
        code: -1,
        msg: '任务不存在'
      } as ApiError;
    }
    
    if (task.status !== TaskStatus.PAUSED) {
      throw {
        code: -1,
        msg: '只能恢复暂停状态的任务'
      } as ApiError;
    }
    
    if (activeDownloadsManager.has(taskId)) {
      throw {
        code: -1,
        msg: '任务已在运行中'
      } as ApiError;
    }
    
    await startDownloadTask(task.id!);
  } catch (error) {
    throw {
      code: -1,
      msg: `恢复暂停任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 停止下载任务
 */
export async function stopDownloadTask(taskId: number): Promise<boolean> {
  try {
    console.log('停止下载任务:', taskId);
    await databaseManager.updateTaskStatus(taskId, TaskStatus.PAUSED);
    const controller = activeDownloadsManager.remove(taskId);

    if (controller) {
      controller.abort();
      console.log('下载任务已暂停:', taskId);
      return true;
    } else {
      throw {
        code: -1,
        msg: `任务 ${taskId} 不在运行中`
      } as ApiError;
    }
  } catch (error) {
    console.log('停止下载任务失败:', error);
    throw {
      code: -1,
      msg: `停止下载任务失败: ${error instanceof Error ? error.message : String(error)}`
    } as ApiError;
  }
}

/**
 * 获取默认文件扩展名
 */
function getDefaultExtension(fileType: string): string {
  const extensionMap: Record<string, string> = {
    'doc': 'docx',
    'docx': 'docx',
    'sheet': 'xlsx',
    'bitable': 'xlsx'
  };
  
  return extensionMap[fileType] || 'pdf';
}

// 导出活动下载管理器供其他模块使用
export { activeDownloadsManager };