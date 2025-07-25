import { app, BrowserWindow, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ipcMain } from 'electron';
import * as https from 'https';
import * as lark from '@larksuiteoapi/node-sdk';
import { TokenManager } from './tokenManager';

const FEISHU_APP_ID = 'cli_a1ad86f33c38500d'; // TODO: 替换为你的 app_id
const FEISHU_APP_SECRET = 'iNw9h4HWv10gsyk0ZbOejhJs7YwHVQo3'; // TODO: 替换为你的 app_secret
const FEISHU_REDIRECT_URI = 'http://localhost:3001/callback';

// 创建飞书SDK客户端
const larkClient = new lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET
});

// 创建Token管理器
const tokenManager = TokenManager.getInstance(larkClient);

// 当前主窗口引用，用于发送token过期通知
let mainWindow: BrowserWindow | null = null;

// 设置token过期回调
tokenManager.setTokenExpiredCallback(() => {
  if (mainWindow) {
    mainWindow.webContents.send('token-expired');
  }
});

// 设置TokenManager的IPC处理函数
tokenManager.setIpcHandlers(
  async () => {
    // 获取refresh_token
    if (mainWindow) {
      try {
        return await mainWindow.webContents.executeJavaScript('localStorage.getItem("feishu_refresh_token")');
      } catch (error) {
        console.error('获取refresh_token失败:', error);
        return null;
      }
    }
    return null;
  },
  async (accessToken: string, refreshToken: string) => {
    // 更新tokens
    if (mainWindow) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          localStorage.setItem('feishu_access_token', '${accessToken}');
          localStorage.setItem('feishu_refresh_token', '${refreshToken}');
        `);
        return true;
      } catch (error) {
        console.error('更新tokens失败:', error);
        return false;
      }
    }
    return false;
  }
);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // 设置全局mainWindow引用
  mainWindow = win;
  
  win.setMenuBarVisibility(false);
  console.log("NODE_ENV", process.env.NODE_ENV);
  // 根据环境加载不同的URL
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
  } else {
    // 生产环境加载本地HTML文件
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
  
  // 窗口关闭时清除引用
  win.on('closed', () => {
    mainWindow = null;
  });
  
  // 窗口加载完成后检查并恢复未完成的下载任务
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      checkAndResumeDownloadTasks();
    }, 2000); // 延迟2秒确保渲染进程完全加载
  });
}

app.whenReady().then(() => {
  console.log("when ready");
  createWindow();
});

/**
 * 使用授权码获取access_token
 * @param code - 授权码
 * @returns Promise<any> - 返回飞书API的响应结果
 */
function getAccessTokenByCode(code: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      grant_type: 'authorization_code',
      code,
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
      redirect_uri: FEISHU_REDIRECT_URI
    });
    
    const options = {
      hostname: 'open.feishu.cn',
      path: '/open-apis/authen/v1/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject({ error: 'JSON parse error', body });
        }
      });
    });
    
    req.on('error', (e) => {
      reject({ error: e.message });
    });
    
    req.write(data);
    req.end();
  });
}



// 处理获取access_token的请求
ipcMain.handle('get-access-token', async (event, code: string) => {
  try {
    console.log('主进程收到获取token请求，授权码:', code);
    const result = await getAccessTokenByCode(code);
    console.log('主进程获取token结果:', result);
    return result;
  } catch (error) {
    console.error('主进程获取token失败:', error);
    throw error;
  }
});

// 处理获取refresh_token的请求
ipcMain.handle('get-refresh-token', async (event) => {
  try {
    // 通过渲染进程获取refresh_token
    return await event.sender.executeJavaScript('localStorage.getItem("feishu_refresh_token")');
  } catch (error) {
    console.error('获取refresh_token失败:', error);
    return null;
  }
});

// 处理更新token的请求
ipcMain.handle('update-tokens', async (event, accessToken: string, refreshToken: string) => {
  try {
    // 通过渲染进程更新localStorage中的token
    await event.sender.executeJavaScript(`
      localStorage.setItem('feishu_access_token', '${accessToken}');
      localStorage.setItem('feishu_refresh_token', '${refreshToken}');
    `);
    return true;
  } catch (error) {
    console.error('更新token失败:', error);
    return false;
  }
});

// 提供 token 给渲染进程（从本地存储获取）
ipcMain.handle('get-user-token', async () => {
  // 由于token现在保存在渲染进程的localStorage中，这个handler可能不再需要
  // 或者可以从文件系统读取token
  return null;
});

/**
 * 获取根文件夹元数据
 */
ipcMain.handle('get-root-folder-meta', async (event, accessToken: string) => {
  try {
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.request({
        method: 'GET',
        url: '/open-apis/drive/explorer/v2/root_folder/meta'
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    return response;
  } catch (error) {
    console.error('获取根文件夹元数据失败:', error);
    throw error;
  }
});

/**
 * 获取文件夹中的文件列表
 */
ipcMain.handle('get-folder-files', async (event, accessToken: string, folderToken?: string, pageSize: number = 200) => {
  try {
    
    const params: any = {
      page_size: pageSize,
      order_by: 'EditedTime',
      direction: 'DESC'
    };
    
    if (folderToken) {
      params.folder_token = folderToken;
    }
    
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.drive.v1.file.list({params: params}, 
        lark.withUserAccessToken(currentToken)
      );
    }, accessToken);
    return response;
  } catch (error) {
    console.error('获取文件夹文件列表失败:', error);
    throw error;
  }
});

/**
 * 获取知识空间列表
 */
ipcMain.handle('get-wiki-spaces', async (event, accessToken: string, pageSize: number = 20) => {
  try {
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.wiki.v2.space.list({
        params: {
          page_size: pageSize
        }
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    return response;
  } catch (error) {
    console.error('获取知识空间列表失败:', error);
    throw error;
  }
});

/**
 * 获取知识空间子节点列表
 */
ipcMain.handle('get-wiki-space-nodes', async (event, accessToken: string, spaceId?: string, parentToken?: string) => {
  console.log("get-wiki-space-nodes", accessToken, spaceId, parentToken);
  try {
    if (!spaceId) {
      throw new Error('spaceId is required for getting wiki space nodes');
    }
    
    const params: any = {};
    if (parentToken) {
      params.parent_node_token = parentToken;
    }
    
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.wiki.v2.spaceNode.list({
        path: {
          space_id: spaceId,
        }, 
        params: params
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    return response;
  } catch (error) {
    console.error('获取知识空间子节点列表失败:', error);
    throw error;
  }
});

/**
 * 选择目录对话框
 */
ipcMain.handle('select-directory', async (event) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择保存目录'
    });
    
    if (result.canceled) {
      return null;
    }
    
    return result.filePaths[0] || null;
  } catch (error) {
    console.error('选择目录失败:', error);
    throw error;
  }
});

/**
 * 打开目录
 */
ipcMain.handle('open-directory', async (event, dirPath: string) => {
  try {
    await shell.openPath(dirPath);
  } catch (error) {
    console.error('打开目录失败:', error);
    throw error;
  }
});

// 下载任务存储路径
const TASKS_FILE_PATH = path.join(app.getPath('userData'), 'download-tasks.json');

/**
 * 读取下载任务列表
 */
function readDownloadTasks(): any[] {
  try {
    if (fs.existsSync(TASKS_FILE_PATH)) {
      const data = fs.readFileSync(TASKS_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('读取下载任务失败:', error);
    return [];
  }
}

/**
 * 保存下载任务列表
 */
function saveDownloadTasks(tasks: any[]): void {
  try {
    const dir = path.dirname(TASKS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (error) {
    console.error('保存下载任务失败:', error);
    throw error;
  }
}

/**
 * 创建下载任务
 */
ipcMain.handle('create-download-task', async (event, task: any) => {
  try {
    const tasks = readDownloadTasks();
    const newTask = {
      ...task,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    tasks.push(newTask);
    saveDownloadTasks(tasks);
    return newTask.id;
  } catch (error) {
    console.error('创建下载任务失败:', error);
    throw error;
  }
});

/**
 * 获取下载任务列表
 */
ipcMain.handle('get-download-tasks', async (event) => {
  try {
    return readDownloadTasks();
  } catch (error) {
    console.error('获取下载任务列表失败:', error);
    throw error;
  }
});

/**
 * 更新下载任务
 */
ipcMain.handle('update-download-task', async (event, id: string, updates: any) => {
  try {
    const tasks = readDownloadTasks();
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      throw new Error(`任务 ${id} 不存在`);
    }
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveDownloadTasks(tasks);
  } catch (error) {
    console.error('更新下载任务失败:', error);
    throw error;
  }
});

/**
 * 删除下载任务
 */
ipcMain.handle('delete-download-task', async (event, id: string) => {
  try {
    const tasks = readDownloadTasks();
    const filteredTasks = tasks.filter(task => task.id !== id);
    saveDownloadTasks(filteredTasks);
  } catch (error) {
    console.error('删除下载任务失败:', error);
    throw error;
  }
});

/**
 * 根据文件类型获取支持的导出格式
 */
function getSupportedExtensions(fileType: string): string[] {
  switch (fileType) {
    case 'doc':
    case 'docx':
      return ['docx', 'pdf'];
    case 'sheet':
      return ['xlsx', 'csv'];
    case 'bitable':
      return ['xlsx', 'csv'];
    default:
      return ['pdf']; // 默认导出为PDF
  }
}

/**
 * 获取文件的默认导出格式
 */
function getDefaultExtension(fileType: string): 'docx' | 'pdf' | 'xlsx' | 'csv' {
  switch (fileType) {
    case 'doc':
    case 'docx':
      return 'docx';
    case 'sheet':
    case 'bitable':
      return 'xlsx';
    default:
      return 'pdf';
  }
}

/**
 * 创建导出任务
 */
async function createExportTask(accessToken: string, fileToken: string, fileType: string): Promise<string> {
  console.log('createExportTask', accessToken, fileToken, fileType);
  try {
    const extension = getDefaultExtension(fileType);
    const validType = ['doc', 'docx', 'sheet', 'bitable'].includes(fileType) ? fileType as 'doc' | 'docx' | 'sheet' | 'bitable' : 'docx';
    
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.drive.v1.exportTask.create({
        data: {
          file_extension: extension,
          token: fileToken,
          type: validType,
        },
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    
    if (response.code !== 0) {
      throw new Error(`创建导出任务失败: ${response.msg}`);
    }
    
    if (!response.data?.ticket) {
      throw new Error('创建导出任务失败: 未获取到ticket');
    }
    
    return response.data.ticket;
  } catch (error) {
    console.error('创建导出任务失败:', error);
    throw error;
  }
}

/**
 * 查询导出任务状态
 */
async function getExportTaskStatus(accessToken: string, ticket: string, fileToken: string): Promise<any> {
  try {
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.drive.v1.exportTask.get({
        path: {
          ticket: ticket,
        },
        params: {
          token: fileToken,
        },
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    
    if (response.code !== 0) {
      throw new Error(`查询导出任务失败: ${response.msg}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('查询导出任务失败:', error);
    throw error;
  }
}

/**
 * 下载文件 - 使用直接下载API（适用于file类型）
 */
async function downloadFile(accessToken: string, fileToken: string, savePath: string): Promise<void> {
  try {
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.drive.v1.file.download({
        path: {
          file_token: fileToken,
        },
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    
    // 确保保存目录存在
    const saveDir = path.dirname(savePath);
    console.log('saveDir', saveDir);
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    // 写入文件
    response.writeFile(savePath);
  } catch (error) {
    console.error('下载文件失败:', error);
    throw error;
  }
}

/**
 * 下载导出任务文件 - 使用导出任务下载API（适用于导出后的文件）
 */
async function downloadExportedFile(accessToken: string, fileToken: string, savePath: string): Promise<void> {
  try {
    const response = await tokenManager.callWithTokenRefresh(async (currentToken) => {
      return await larkClient.drive.v1.exportTask.download({
        path: {
          file_token: fileToken,
        },
      }, lark.withUserAccessToken(currentToken));
    }, accessToken);
    
    // 确保保存目录存在
    const saveDir = path.dirname(savePath);
    console.log('saveDir', saveDir);
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    // 写入文件
    response.writeFile(savePath);
  } catch (error) {
    console.error('下载导出文件失败:', error);
    throw error;
  }
}

/**
 * 等待导出任务完成
 */
async function waitForExportTask(accessToken: string, ticket: string, fileToken: string, maxRetries: number = 30): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const taskStatus = await getExportTaskStatus(accessToken, ticket, fileToken);
    
    if (taskStatus.result && taskStatus.result.file_token) {
      return taskStatus.result.file_token;
    }
    
    // 等待2秒后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('导出任务超时');
}

/**
 * 执行下载任务
 */
ipcMain.handle('execute-download-task', async (event, taskId: string, accessToken: string) => {
  try {
    console.log(`开始执行下载任务: ${taskId}`);
    
    // 获取任务信息
    const tasks = readDownloadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    
    // 更新任务状态为下载中
    await updateTaskStatus(taskId, 'downloading', 0);
    
    const totalFiles = task.files.length;
    let completedFiles = 0;
    
    // 逐个处理文件
    for (const file of task.files) {
      try {
        console.log(`开始处理文件: ${file.name}, type: ${file.type}`);
        
        // 更新文件状态为下载中
        await updateFileStatus(taskId, file.token, 'downloading');
        
        if (file.type === 'file') {
          // 对于file类型，直接使用下载API
          // relativePath已经包含完整路径，直接添加文件名
          const fileSavePath = path.join(task.savePath, file.relativePath, file.name);
          
          // 确保目录存在
          const dirPath = path.dirname(fileSavePath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          await downloadFile(accessToken, file.token, fileSavePath);
          console.log(`文件下载完成: ${fileSavePath}`);
          
          // 更新文件状态为完成
          await updateFileStatus(taskId, file.token, 'completed');
        } else if (['doc', 'docx', 'sheet', 'bitable'].includes(file.type)) {
          // 对于文档类型，使用导出任务
          const ticket = await createExportTask(accessToken, file.token, file.type);
          console.log(`创建导出任务成功，ticket: ${ticket}`);
          
          // 等待导出完成
          const downloadFileToken = await waitForExportTask(accessToken, ticket, file.token);
          console.log(`导出任务完成，下载文件token: ${downloadFileToken}`);
          
          // 构建保存路径
          const extension = getDefaultExtension(file.type);
          const fileName = `${file.name}.${extension}`;
          // relativePath已经包含完整路径，直接添加文件名
          const fileSavePath = path.join(task.savePath, file.relativePath, fileName);
          
          // 确保目录存在
          const dirPath = path.dirname(fileSavePath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          // 下载导出的文件
          await downloadExportedFile(accessToken, downloadFileToken, fileSavePath);
          console.log(`文件下载完成: ${fileSavePath}`);
          
          // 更新文件状态为完成
          await updateFileStatus(taskId, file.token, 'completed');
        } else {
          console.log(`跳过不支持的文件类型: ${file.type}`);
          // 对于不支持的文件类型，标记为完成
          await updateFileStatus(taskId, file.token, 'completed');
        }
        
        completedFiles++;
        const progress = Math.round((completedFiles / totalFiles) * 100);
        
        // 更新任务进度
        await updateTaskProgress(taskId, progress, completedFiles);
        
        // 通知渲染进程更新进度
        event.sender.send('download-progress', {
          taskId,
          progress,
          completedFiles,
          totalFiles,
          currentFile: file.name
        });
        
      } catch (fileError) {
        console.error(`处理文件失败: ${file.name}`, fileError);
        // 提取错误信息
        let errorMessage = '下载失败';
        if (fileError && typeof fileError === 'object') {
          // 检查是否是AxiosError类型的飞书API错误响应
          if ('response' in fileError && fileError.response && 
              typeof fileError.response === 'object' && 'data' in fileError.response &&
              fileError.response.data && typeof fileError.response.data === 'object' && 
              'msg' in fileError.response.data) {
            errorMessage = fileError.response.data.msg as string;
          } else if ('data' in fileError && fileError.data && typeof fileError.data === 'object' && 'msg' in fileError.data) {
            errorMessage = fileError.data.msg as string;
          } else if ('message' in fileError) {
            errorMessage = fileError.message as string;
          } else if ('msg' in fileError) {
            errorMessage = fileError.msg as string;
          }
        } else if (typeof fileError === 'string') {
          errorMessage = fileError;
        }
        
        // 更新文件状态为失败，并保存错误信息
        await updateFileStatus(taskId, file.token, 'failed', errorMessage);
        completedFiles++;
        const progress = Math.round((completedFiles / totalFiles) * 100);
        await updateTaskProgress(taskId, progress, completedFiles);
        
        // 发送文件下载失败的通知到渲染进程
        event.sender.send('download-file-error', {
          taskId,
          fileName: file.name,
          error: errorMessage
        });
      }
    }
    
    // 更新任务状态为完成
    await updateTaskStatus(taskId, 'completed', 100);
    
    // 通知渲染进程任务完成
    event.sender.send('download-complete', { taskId });
    
    console.log(`下载任务完成: ${taskId}`);
    
  } catch (error) {
    console.error('执行下载任务失败:', error);
    
    // 更新任务状态为失败
    await updateTaskStatus(taskId, 'failed', 0);
    
    // 通知渲染进程任务失败
    const errorMessage = error instanceof Error ? error.message : String(error);
    event.sender.send('download-error', { taskId, error: errorMessage });
    
    throw error;
  }
});

/**
 * 更新任务状态
 */
async function updateTaskStatus(taskId: string, status: string, progress: number): Promise<void> {
  const tasks = readDownloadTasks();
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex !== -1) {
    tasks[taskIndex].status = status;
    tasks[taskIndex].progress = progress;
    tasks[taskIndex].updatedAt = new Date().toISOString();
    saveDownloadTasks(tasks);
  }
}

/**
 * 更新任务进度
 */
async function updateTaskProgress(taskId: string, progress: number, downloadedFiles: number): Promise<void> {
  const tasks = readDownloadTasks();
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex !== -1) {
    tasks[taskIndex].progress = progress;
    tasks[taskIndex].downloadedFiles = downloadedFiles;
    tasks[taskIndex].updatedAt = new Date().toISOString();
    saveDownloadTasks(tasks);
  }
}

/**
 * 更新文件状态
 */
async function updateFileStatus(taskId: string, fileToken: string, status: string, errorMessage?: string): Promise<void> {
  const tasks = readDownloadTasks();
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex !== -1) {
    const fileIndex = tasks[taskIndex].files.findIndex((file: any) => file.token === fileToken);
    if (fileIndex !== -1) {
      tasks[taskIndex].files[fileIndex].status = status;
      if (errorMessage) {
        tasks[taskIndex].files[fileIndex].errorMessage = errorMessage;
      }
      tasks[taskIndex].updatedAt = new Date().toISOString();
      saveDownloadTasks(tasks);
    }
  }
}

/**
 * 重试下载单个文件
 */
ipcMain.handle('retry-download-file', async (event, taskId: string, fileToken: string, accessToken: string) => {
  try {
    console.log(`开始重试下载文件: taskId=${taskId}, fileToken=${fileToken}`);
    
    // 获取任务信息
    const tasks = readDownloadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    
    // 查找要重试的文件
    const file = task.files.find((f: any) => f.token === fileToken);
    if (!file) {
      throw new Error(`文件 ${fileToken} 不存在`);
    }
    
    console.log(`重试下载文件: ${file.name}, type: ${file.type}`);
    
    // 更新文件状态为下载中
    await updateFileStatus(taskId, file.token, 'downloading');
    
    // 清除之前的错误信息
    await updateFileStatus(taskId, file.token, 'downloading', '');
    
    try {
      if (file.type === 'file') {
        // 对于file类型，直接使用下载API
        const fileSavePath = path.join(task.savePath, file.relativePath, file.name);
        
        // 确保目录存在
        const dirPath = path.dirname(fileSavePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        await downloadFile(accessToken, file.token, fileSavePath);
        console.log(`文件重试下载完成: ${fileSavePath}`);
        
        // 更新文件状态为完成
        await updateFileStatus(taskId, file.token, 'completed');
      } else if (['doc', 'docx', 'sheet', 'bitable'].includes(file.type)) {
        // 对于文档类型，使用导出任务
        const ticket = await createExportTask(accessToken, file.token, file.type);
        console.log(`创建导出任务成功，ticket: ${ticket}`);
        
        // 等待导出完成
        const downloadFileToken = await waitForExportTask(accessToken, ticket, file.token);
        console.log(`导出任务完成，下载文件token: ${downloadFileToken}`);
        
        // 构建保存路径
        const extension = getDefaultExtension(file.type);
        const fileName = `${file.name}.${extension}`;
        const fileSavePath = path.join(task.savePath, file.relativePath, fileName);
        
        // 确保目录存在
        const dirPath = path.dirname(fileSavePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // 下载导出的文件
        await downloadExportedFile(accessToken, downloadFileToken, fileSavePath);
        console.log(`文件重试下载完成: ${fileSavePath}`);
        
        // 更新文件状态为完成
        await updateFileStatus(taskId, file.token, 'completed');
      } else {
        console.log(`跳过不支持的文件类型: ${file.type}`);
        // 对于不支持的文件类型，标记为完成
        await updateFileStatus(taskId, file.token, 'completed');
      }
      
      // 重新计算任务进度
      const completedFiles = task.files.filter((f: any) => f.status === 'completed').length;
      const progress = Math.round((completedFiles / task.files.length) * 100);
      await updateTaskProgress(taskId, progress, completedFiles);
      
      // 通知渲染进程文件重试成功
      event.sender.send('download-progress', {
        taskId,
        progress,
        completedFiles,
        totalFiles: task.files.length,
        currentFile: file.name
      });
      
      console.log(`文件重试下载成功: ${file.name}`);
      
    } catch (fileError) {
      console.error(`重试下载文件失败: ${file.name}`, fileError);
      
      // 提取错误信息
      let errorMessage = '重试下载失败';
      if (fileError && typeof fileError === 'object') {
        // 检查是否是AxiosError类型的飞书API错误响应
        if ('response' in fileError && fileError.response && 
            typeof fileError.response === 'object' && 'data' in fileError.response &&
            fileError.response.data && typeof fileError.response.data === 'object' && 
            'msg' in fileError.response.data) {
          errorMessage = fileError.response.data.msg as string;
        } else if ('data' in fileError && fileError.data && typeof fileError.data === 'object' && 'msg' in fileError.data) {
          errorMessage = fileError.data.msg as string;
        } else if ('message' in fileError) {
          errorMessage = fileError.message as string;
        } else if ('msg' in fileError) {
          errorMessage = fileError.msg as string;
        }
      } else if (typeof fileError === 'string') {
        errorMessage = fileError;
      }
      
      // 更新文件状态为失败，并保存错误信息
      await updateFileStatus(taskId, file.token, 'failed', errorMessage);
      
      // 发送文件下载失败的通知到渲染进程
      event.sender.send('download-file-error', {
        taskId,
        fileName: file.name,
        error: errorMessage
      });
      
      throw new Error(`重试下载文件失败: ${errorMessage}`);
    }
    
  } catch (error) {
    console.error('重试下载文件失败:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(errorMessage);
  }
});

// 创建新的BrowserWindow来处理飞书授权
ipcMain.handle('open-feishu-auth', async (event, url: string) => {
  console.log("open-feishu-auth", url);
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const authWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    parent: parentWindow || undefined,
    modal: true
  });
  
  // 添加调试日志
  console.log('创建授权窗口，准备加载URL:', url);
  
  /**
   * 检查URL是否包含授权码并处理，直接获取access_token
   */
  const checkAuthCode = async (navigationUrl: string, eventType: string) => {
    if (authCodeSent) {
      console.log('授权码已处理，跳过重复处理');
      return;
    }
    
    console.log(`${eventType}:`, navigationUrl);
    try {
      const urlObj = new URL(navigationUrl);
      if (urlObj.hostname === 'localhost' && urlObj.port === '3001' && urlObj.pathname === '/callback') {
        const code = urlObj.searchParams.get('code');
        console.log('检测到回调URL，授权码:', code);
        if (code) {
          authCodeSent = true; // 标记授权码已处理
          
          try {
            // 直接在主进程中获取access_token
            console.log('主进程开始获取access_token，授权码:', code);
            const tokenResult = await getAccessTokenByCode(code);
            console.log('主进程获取token结果:', tokenResult);
            
            // 检查返回结果
            if (parentWindow && tokenResult.code === 0) {
              // 发送完整的认证信息到主窗口，包含用户信息
              const authData = {
                access_token: tokenResult.data.access_token,
                refresh_token: tokenResult.data.refresh_token,
                user_info: {
                  name: tokenResult.data.name,
                  en_name: tokenResult.data.en_name,
                  email: tokenResult.data.email,
                  mobile: tokenResult.data.mobile,
                  avatar_url: tokenResult.data.avatar_url,
                  avatar_thumb: tokenResult.data.avatar_thumb,
                  avatar_middle: tokenResult.data.avatar_middle,
                  avatar_big: tokenResult.data.avatar_big,
                  open_id: tokenResult.data.open_id,
                  union_id: tokenResult.data.union_id,
                  user_id: tokenResult.data.user_id,
                  tenant_key: tokenResult.data.tenant_key
                }
              };
              parentWindow.webContents.send('feishu-access-token', authData);
              console.log('认证信息已发送到主窗口');
            } else {
              console.error('获取token失败或token为空:', tokenResult);
              // 发送错误信息到主窗口
              if (parentWindow) {
                parentWindow.webContents.send('feishu-auth-error', tokenResult);
              }
            }
          } catch (error) {
            console.error('获取access_token失败:', error);
            // 发送错误信息到主窗口
            if (parentWindow) {
              parentWindow.webContents.send('feishu-auth-error', error);
            }
          }
          
          authWindow.close();
        }
      }
    } catch (error) {
      console.error('解析URL失败:', error);
    }
  };

  const filter = { urls: ['http://localhost:3001/callback*'] }
  let isAuthHandled = false;
  let authCodeSent = false; // 防止重复发送授权码

  authWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (authCodeSent) {
      console.log('授权码已发送，跳过重复处理');
      callback({ cancel: true });
      return;
    }
    
    isAuthHandled = true;
    console.log('Intercepted callback:', details.url);
    checkAuthCode(details.url, 'onBeforeRequest');
    callback({ cancel: true });
    setImmediate(() => {
      authWindow.close();
      authWindow.destroy();
    });
  });
  
  // 监听页面加载完成
  authWindow.webContents.on('did-finish-load', () => {
    console.log("isAuthHandled", isAuthHandled);
    const currentUrl = authWindow.webContents.getURL();
    console.log('页面加载完成:', currentUrl);
    if (isAuthHandled) {
      console.log('[electron] 已处理，忽略 did-finish-load');
      return; // 已拦截到，忽略这次触发
    }
    // checkAuthCode(currentUrl, 'did-finish-load');
    authWindow.close();
  });
  
  // 监听窗口关闭
  authWindow.on('closed', () => {
    console.log('授权窗口已关闭');
  });


  authWindow.loadURL(url);
  
  return true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log("activate", BrowserWindow.getAllWindows().length);
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * 检查并恢复未完成的下载任务
 */
async function checkAndResumeDownloadTasks(): Promise<void> {
  try {
    console.log('检查未完成的下载任务...');
    
    // 读取所有下载任务
    const tasks = readDownloadTasks();
    
    // 查找状态为'downloading'的任务
    const downloadingTasks = tasks.filter(task => task.status === 'downloading');
    
    if (downloadingTasks.length === 0) {
      console.log('没有未完成的下载任务');
      return;
    }
    
    console.log(`发现 ${downloadingTasks.length} 个未完成的下载任务，准备恢复...`);
    
    // 通知渲染进程有未完成的任务需要恢复
    if (mainWindow) {
      mainWindow.webContents.send('resume-download-tasks', {
        count: downloadingTasks.length,
        tasks: downloadingTasks.map(task => ({
          id: task.id,
          name: task.name,
          progress: task.progress
        }))
      });
    }
    
  } catch (error) {
    console.error('检查未完成下载任务失败:', error);
  }
}

/**
 * 处理恢复下载任务的请求
 */
ipcMain.handle('resume-download-tasks', async (event) => {
  try {
    console.log('开始恢复未完成的下载任务...');
    
    // 获取access_token
    const access_token = await event.sender.executeJavaScript('localStorage.getItem("feishu_access_token")');
    if (!access_token) {
      console.log('未找到access_token，无法恢复下载任务');
      return { success: false, message: '请先登录飞书账号' };
    }
    
    // 读取所有下载任务
    const tasks = readDownloadTasks();
    
    // 查找状态为'downloading'的任务
    const downloadingTasks = tasks.filter(task => task.status === 'downloading');
    
    if (downloadingTasks.length === 0) {
      return { success: true, message: '没有需要恢复的下载任务' };
    }
    
    console.log(`开始恢复 ${downloadingTasks.length} 个下载任务`);
    
    // 逐个恢复下载任务
    for (const task of downloadingTasks) {
      try {
        console.log(`恢复下载任务: ${task.name} (${task.id})`);
        
        // 重置任务状态为pending，然后重新开始下载
        await updateTaskStatus(task.id, 'pending', task.progress);
        
        // 异步执行下载任务，不等待完成
        setTimeout(async () => {
          try {
            // 通知渲染进程开始恢复下载任务
            if (mainWindow) {
              mainWindow.webContents.send('auto-resume-task', {
                taskId: task.id,
                taskName: task.name
              });
            }
          } catch (error) {
            console.error(`恢复下载任务失败: ${task.name}`, error);
          }
        }, 1000 * downloadingTasks.indexOf(task)); // 错开执行时间
        
      } catch (error) {
        console.error(`恢复下载任务失败: ${task.name}`, error);
      }
    }
    
    return { 
      success: true, 
      message: `已开始恢复 ${downloadingTasks.length} 个下载任务`,
      count: downloadingTasks.length
    };
    
  } catch (error) {
    console.error('恢复下载任务失败:', error);
    return { success: false, message: '恢复下载任务失败' };
  }
});