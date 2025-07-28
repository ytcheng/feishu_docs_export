import React, { useState, useEffect } from 'react';
import { Card, Tree, Button, Space, message, Spin } from 'antd';
import { 
  DownloadOutlined, 
  FolderOutlined, 
  BookOutlined, 
  HomeOutlined,
  FileTextOutlined,
  TableOutlined,
  DatabaseOutlined,
  PaperClipOutlined,
  FileOutlined,
  FolderOpenOutlined,
  CloudOutlined
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriApi } from '../utils/tauriApi';
import type { DownloadTask, DownloadFile, FeishuWikiRoot, FeishuWikiSpace, FeishuWikiNode, FeishuFile, FeishuFolder, FeishuRootMeta } from '../types';

type NodeType = 'FeishuWikiRoot' | 'FeishuWikiSpace' | 'FeishuWikiNode' | 'FeishuFile' | 'FeishuFolder' | 'FeishuRootMeta';
type FileItem = FeishuWikiRoot | FeishuWikiSpace | FeishuWikiNode | FeishuFile | FeishuFolder | FeishuRootMeta;
const iconStyle = {
  fontSize: '16px'
};
interface BaseTreeNode {
  title: string;
  key: string;
  icon?:  React.ReactNode;
  type: NodeType;
  isLeaf?: boolean;
  children?: TreeNode[]; 
  fileItem: FileItem;
  loadChildren: (accessToken?: string) => Promise<TreeNode[]>;
}

interface FeishuWikiRootTreeNode extends BaseTreeNode {
  type: 'FeishuWikiRoot';
  fileItem: FeishuWikiRoot;
}
function createWikiRootTreeNode(fileItem: FeishuWikiRoot): FeishuWikiRootTreeNode {
  return {
    title: "知识库",
    key: "wiki_root",
    type: 'FeishuWikiRoot',
    icon: <HomeOutlined style={{ ...iconStyle, color: '#722ed1' }} />,
    fileItem,
    isLeaf: false,
    loadChildren: async (accessToken?: string) => {
      const spaces = await tauriApi.getWikiSpaces(accessToken);
      return spaces.map(createWikiSpaceTreeNode);
    }
  };
}


interface FeishuWikiSpaceTreeNode extends BaseTreeNode {
  type: 'FeishuWikiSpace';
  fileItem: FeishuWikiSpace;
}
function createWikiSpaceTreeNode(fileItem: FeishuWikiSpace): FeishuWikiSpaceTreeNode {
  return {
    title: fileItem.name,
    key: fileItem.space_id,
    type: 'FeishuWikiSpace',
    icon: <BookOutlined style={{ ...iconStyle, color: '#52c41a' }} />,
    fileItem,
    isLeaf: false,
    loadChildren: async (accessToken?: string) => {
      const nodes = await tauriApi.getWikiSpaceNodes(fileItem.space_id, undefined, accessToken);
      return nodes.map(createWikiNodeTreeNode);
    }
  };
}

interface FeishuWikiTreeNode extends BaseTreeNode {
  type: 'FeishuWikiNode';
  fileItem: FeishuWikiNode;
}
function createWikiNodeTreeNode(fileItem: FeishuWikiNode): FeishuWikiTreeNode {
  return {
    title: fileItem.title,
    key: fileItem.node_token,
    type: 'FeishuWikiNode',
    icon: fileItem.has_child ?  <FolderOpenOutlined style={{ ...iconStyle, color: '#fa8c16' }} /> : <FileTextOutlined style = {{ ...iconStyle, color: '#13c2c2'}} />,
    fileItem,
    isLeaf: fileItem.has_child,
    loadChildren: async (accessToken?: string) => {
      if (!fileItem.has_child) {
        return [];
      }
      const nodes = await tauriApi.getWikiSpaceNodes(fileItem.space_id, fileItem.node_token, accessToken);
      return nodes.map(createWikiNodeTreeNode);
    }
  };
}

interface FeishuFileTreeNode extends BaseTreeNode {
  type: 'FeishuFile';
  fileItem: FeishuFile;
}
function createFileTreeNode(fileItem: FeishuFile): FeishuFileTreeNode {
  let icon = <PaperClipOutlined style={{ ...iconStyle, color: '#fa541c' }} />;
  switch (fileItem.type) {
    case 'doc':
    case 'docx':
      icon =  <FileTextOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
      break;
    case 'sheet':
      icon = <TableOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
      break;
    case 'bitable':
      icon = <DatabaseOutlined style={{ ...iconStyle, color: '#722ed1' }} />;
      break;
  }
  console.log(fileItem);
  return {
    title: fileItem.name === '' ? "未命名文件" : fileItem.name,
    key: fileItem.token,
    type: 'FeishuFile',
    icon,
    fileItem,
    isLeaf: true,
    loadChildren: async (_accessToken?: string) => [],
  };
}

interface FeishuFolderTreeNode extends BaseTreeNode {
  type: 'FeishuFolder';
  fileItem: FeishuFolder;
}
function createFolderTreeNode(fileItem: FeishuFolder): FeishuFolderTreeNode {
  return {
    title: fileItem.name,
    key: fileItem.token,
    type: 'FeishuFolder',
    icon: <FolderOutlined style={{ ...iconStyle, color: '#1890ff' }} />,
    fileItem,
    isLeaf: false,
    loadChildren: async (accessToken?: string) => {
      const files = await tauriApi.getFolderFiles(fileItem.token, accessToken);
      return files.map((file) => {
        if (file.type === 'folder') {
          return createFolderTreeNode(file);
        }
        return createFileTreeNode(file);
      });
    }
  };
}

interface FeishuRootMetaTreeNode extends BaseTreeNode {
  type: 'FeishuRootMeta';
  fileItem: FeishuRootMeta;
}
function createRootMetaTreeNode(fileItem: FeishuRootMeta): FeishuRootMetaTreeNode {
  return {
    title: "云盘",
    key: fileItem.token,
    type: 'FeishuRootMeta',
    icon: <CloudOutlined style={{ ...iconStyle, color: '#fa541c' }} />,
    fileItem,
    isLeaf: false,
    loadChildren: async (accessToken?: string) => {
      const files = await tauriApi.getFolderFiles(fileItem.token, accessToken);
      return files.map((file) => {
        if (file.type === 'folder') {
          return createFolderTreeNode(file);
        }
        return createFileTreeNode(file);
      });
    }
  };
}
type TreeNode =
  | FeishuWikiRootTreeNode
  | FeishuWikiSpaceTreeNode
  | FeishuWikiTreeNode
  | FeishuFileTreeNode
  | FeishuFolderTreeNode
  | FeishuRootMetaTreeNode;

interface HomePageProps {
  onViewTasks: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onViewTasks }) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [_tasksLoading, setTasksLoading] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);


  // /**
  //  * 获取文件夹文件列表
  //  */
  // const getFolderFiles = async (folderToken?: string): Promise<FileItem[]> => {
  //   try {
  //     console.log("getFolderFiles folderToken", folderToken);
  //     const files = await tauriApi.getFolderFiles(folderToken);
  //     return files;
      
  //   } catch (error) {
  //     console.error('获取文件列表失败:', error);
  //     message.error('获取文件列表失败');
  //     return [];
  //   }
  // };

  // /**
  //  * 获取知识空间列表
  //  */
  // const getWikiSpaces = async (): Promise<FileItem[]> => {
  //   try {
  //     const wikiSpaces = await tauriApi.getWikiSpaces();
      
  //     return (wikiSpaces || []).map((space: any) => ({
  //         token: space.space_id,
  //         name: space.name || '未命名知识空间',
  //         type: 'wiki_space' as const,
  //         space_id: space.space_id,
  //         has_child: true // 知识空间默认可以展开
  //       }));
  //   } catch (error) {
  //     console.error('获取知识空间列表失败:', error);
  //     message.error('获取知识空间列表失败');
  //     return [];
  //   }
  // };

  // /**
  //  * 获取知识空间子节点列表
  //  */
  // const getWikiSpaceNodes = async (spaceId?: string, parentToken?: string): Promise<FileItem[]> => {
  //   try {
  //     if (!spaceId) {
  //       message.error('知识空间ID不能为空');
  //       return [];
  //     }
      
  //     const wikiNodes = await tauriApi.getWikiSpaceNodes(spaceId, parentToken);
      
  //     return (wikiNodes || []).map((node: any) => ({
  //         token: node.node_token,
  //         name: node.title || '未命名节点',
  //         type: 'wiki_node' as const,
  //         space_id: spaceId,
  //         node_type: node.node_type,
  //         obj_type: node.obj_type,
  //         obj_token: node.obj_token,
  //         has_child: node.has_child
  //       }));
      
  //   } catch (error) {
  //     console.error('获取知识空间子节点失败:', error);
  //     message.error('获取知识空间子节点失败');
  //     return [];
  //   }
  // };

  // /**
  //  * 获取根文件夹元数据
  //  */
  // const getRootFolderMeta = async (): Promise<any> => {
  //   try {
  //     return await tauriApi.getRootFolderMeta();
  //   } catch (error) {
  //     console.error('获取根文件夹失败:', error);
  //     message.error('获取根文件夹失败');
  //     return null;
  //   }
  // };

  /**
   * 动态加载子节点数据
   */
  const onLoadData = async ({ key, children, loadChildren }: TreeNode): Promise<void> => {
    if (children && children.length > 0) {
      return;
    }

    try {
      const newTreeData = await loadChildren();
      
      setTreeData(prevTreeData => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map(node => {
            if (node.key === key) {
              return { ...node, children: newTreeData, isLeaf: newTreeData.length === 0 };
            }
            if (node.children) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });
        };
        return updateNode(prevTreeData);
      });
    } catch (error) {
      console.error('加载子节点失败:', error);
      message.error('加载子节点失败');
    }
  };

  /**
   * 加载根目录数据（云盘和知识库）
   */
  const loadRootData = async () => {
    setLoading(true);
    try {
      const rootMeta = await tauriApi.getRootFolderMeta();
      console.log("loadRootData rootMeta", rootMeta);
      if (!rootMeta) {
        return;
      }

      const driveRoot = createRootMetaTreeNode(rootMeta);

      const wikiRoot = createWikiRootTreeNode({});

      setTreeData([driveRoot, wikiRoot]);
      setExpandedKeys([rootMeta.token, 'wiki_root']);
    } catch (error) {
      console.error('加载根目录数据失败:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理树节点展开
   */
  const onExpand = (keys: React.Key[]) => {
    setExpandedKeys(keys as string[]);
  };


  // /**
  //  * 构建文件路径
  //  */
  // const buildFilePath = (node: TreeNode, pathFromRoot: string[]): string => {
  //   const pathParts = [...pathFromRoot];
  //   // if (file.name && file.name !== '云盘' && file.name !== '知识库') {
  //   pathParts.push(node.title);
  //   // }
  //   return pathParts.join('/');
  // };

  // /**
  //  * 递归获取文件夹下所有文件（带路径）
  //  */
  // const getAllFilesFromFolderWithPath = async (
  //   token: string, 
  //   type: string, 
  //   spaceId?: string, 
  //   currentPath: string[] = []
  // ): Promise<Array<FileItem & { fullPath: string }>> => {
  //   const allFiles: Array<FileItem & { fullPath: string }> = [];
    
  //   try {
  //     let files: FileItem[] = [];
      
  //     if (type === 'folder') {
  //       files = await getFolderFiles(token);
  //     } else if (type === 'wiki_space') {
  //       files = await getWikiSpaceNodes(spaceId!);
  //     } else if (type === 'wiki_root') {
  //       files = await getWikiSpaces();
  //     } else if (type === 'wiki_node') {
  //       files = await getWikiSpaceNodes(spaceId!, token);
  //     }
      
  //     for (const file of files) {
  //       if (file.has_child && (file.type === 'folder' || file.type === 'wiki_node')) {
  //         const newPath = [...currentPath];
  //         if (file.name && file.name !== '云盘' && file.name !== '知识库') {
  //           newPath.push(file.name);
  //         }
          
  //         if (file.type === 'wiki_node') {
  //           const fullPath = buildFilePath(file, currentPath);
  //           allFiles.push({ ...file, fullPath });
  //         }
  //         const subFiles = await getAllFilesFromFolderWithPath(file.token, file.type, file.space_id || spaceId, newPath);
  //         allFiles.push(...subFiles);
  //       } else {
  //         const fullPath = buildFilePath(file, currentPath);
  //         allFiles.push({ ...file, fullPath });
  //       }
  //     }
  //   } catch (error) {
  //     console.error(`获取文件夹 ${token} 下的文件失败:`, error);
  //   }
    
  //   return allFiles;
  // };

  /**
   * 根据选中的节点获取所有需要下载的文件
   */
  const getSelectedFiles = async (): Promise<Array<FileItem & { fullPath: string }>> => {
    return [];
    // const allFiles: Array<FileItem & { fullPath: string }> = [];
    
    // const findNodeByKey = (nodes: TreeNode[], key: string): TreeNode | null => {
    //   for (const node of nodes) {
    //     if (node.key === key) {
    //       return node;
    //     }
    //     if (node.children) {
    //       const found = findNodeByKey(node.children, key);
    //       if (found) return found;
    //     }
    //   }
    //   return null;
    // };
    
    // const getNodePath = (nodes: TreeNode[], targetKey: string, currentPath: string[] = []): string[] | null => {
    //   for (const node of nodes) {
    //     const newPath = [...currentPath];
    //     newPath.push(node.title);
        
    //     if (node.key === targetKey) {
    //       return newPath;
    //     }
        
    //     if (node.children) {
    //       const found = getNodePath(node.children, targetKey, newPath);
    //       if (found) return found;
    //     }
    //   }
    //   return null;
    // };
    
    // for (const key of selectedKeys) {
    //   const node = findNodeByKey(treeData, key);
    //   if (!node) continue;
      
    //   const fileItem = node.fileItem;
    //   const nodePath = getNodePath(treeData, key);
    //   const pathFromRoot = nodePath ? nodePath.slice(0, -1) : [];
      
    //   if (fileItem.type === 'folder' || fileItem.type === 'wiki_root' || fileItem.type === 'wiki_space' || (fileItem.type === 'wiki_node' && fileItem.has_child)) {
    //     if (fileItem.type === 'wiki_node') {
    //       const fullPath = buildFilePath(fileItem, nodePath || []);
    //       allFiles.push({ ...fileItem, fullPath });
    //     }
    //     const folderFiles = await getAllFilesFromFolderWithPath(fileItem.token, fileItem.type, fileItem.space_id, nodePath || []);
    //     allFiles.push(...folderFiles);
    //   } else {
    //     const fullPath = buildFilePath(fileItem, pathFromRoot);
    //     allFiles.push({ ...fileItem, fullPath });
    //   }
    // }
    
    // return allFiles;
  };

  /**
   * 创建并开始下载任务
   */
  const handleExport = async () => {
    if (!selectedKeys.length) {
      message.warning('请选择要导出的文件或文件夹');
      return;
    }

    // 选择保存目录
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      
      if (!selected || typeof selected !== 'string') {
        return;
      }

      setCreating(true);
      message.info('正在分析选中的文件，请稍候...');
      
      const filesToDownload = await getSelectedFiles();
      
      if (filesToDownload.length === 0) {
        message.warning('未找到可下载的文件');
        return;
      }
      
      // const downloadFiles: DownloadFile[] = filesToDownload.map(file => {
      //   let actualType: DownloadFile['type'] = file.type;
      //   let actualToken: string = file.token;
        
      //   if (file.type === 'wiki_node' && file.obj_type) {
      //     const validTypes: DownloadFile['type'][] = ['doc', 'docx', 'sheet', 'bitable', 'file'];
      //     actualType = validTypes.includes(file.obj_type as DownloadFile['type']) 
      //       ? (file.obj_type as DownloadFile['type']) 
      //       : 'doc';
      //     actualToken = file.obj_token || file.token;
      //   }
        
      //   return {
      //     token: actualToken,
      //     name: file.name || '未命名文件',
      //     type: actualType,
      //     spaceId: file.space_id,
      //     relativePath: file.fullPath,
      //     status: 'pending' as const,
      //     progress: 0
      //   };
      // });
      const downloadFiles: DownloadFile[] = [];
      const task: Omit<DownloadTask, 'id' | 'createdAt' | 'updatedAt'> = {
        name: `导出任务 - ${new Date().toLocaleString()}`,
        status: 'pending',
        progress: 0,
        totalFiles: downloadFiles.length,
        downloadedFiles: 0,
        failedFiles: 0,
        outputPath: selected,
        sourceType: 'drive',
        files: downloadFiles
      };
    
      const result = await tauriApi.createDownloadTask(task);
      const taskId = typeof result === 'string' ? result : result.id;
      
      message.success(`成功创建导出任务，共 ${filesToDownload.length} 个文件`);
      setSelectedKeys([]);
      
      // 自动开始下载任务
      try {
        const accessToken = localStorage.getItem('feishu_access_token');
        if (accessToken) {
          message.info('正在开始导出任务...');
          await tauriApi.executeDownloadTask(taskId, accessToken);
          message.success('导出任务已开始');
          loadTasks(); // 刷新任务列表
        } else {
          message.warning('未找到访问令牌，请手动开始导出任务');
        }
      } catch (executeError) {
        console.error('自动开始导出任务失败:', executeError);
        let errorMessage = '自动开始导出失败，请手动开始';
        if (executeError && typeof executeError === 'object') {
          if ('response' in executeError && executeError.response && 
              typeof executeError.response === 'object' && 'data' in executeError.response &&
              executeError.response.data && typeof executeError.response.data === 'object' && 
              'msg' in executeError.response.data) {
            errorMessage = `自动开始导出失败: ${executeError.response.data.msg}`;
          } else if ('data' in executeError && executeError.data && typeof executeError.data === 'object' && 'msg' in executeError.data) {
            errorMessage = `自动开始导出失败: ${executeError.data.msg}`;
          } else if ('message' in executeError) {
            errorMessage = `自动开始导出失败: ${executeError.message}`;
          }
        } else if (typeof executeError === 'string') {
          errorMessage = `自动开始导出失败: ${executeError}`;
        }
        message.warning(errorMessage);
      }
      
    } catch (error) {
      console.error('创建导出任务失败:', error);
      message.error('创建导出任务失败');
    } finally {
      setCreating(false);
    }
  };

  /**
   * 加载任务列表
   */
  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const allTasks = await tauriApi.getDownloadTasks();
      // 只显示进行中的任务
      const activeTasks = allTasks.filter(task => 
        task.status === 'downloading' || task.status === 'pending'
      );
      setTasks(activeTasks);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setTasksLoading(false);
    }
  };



  useEffect(() => {
    loadRootData();
    loadTasks();
    
    // 定期刷新任务状态
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  // 多任务轮播效果
  useEffect(() => {
    const downloadingTasks = tasks.filter(task => task.status === 'downloading');
    if (downloadingTasks.length > 1) {
      const carouselInterval = setInterval(() => {
        setCurrentTaskIndex(prev => (prev + 1) % downloadingTasks.length);
      }, 2000); // 每2秒切换一次
      return () => clearInterval(carouselInterval);
    } else {
      setCurrentTaskIndex(0);
    }
  }, [tasks]);

  /**
   * 获取当前活跃任务的简要信息（支持轮播显示）
   */
  const getActiveTaskSummary = () => {
    const downloadingTasks = tasks.filter(task => task.status === 'downloading');
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    
    if (downloadingTasks.length === 0 && pendingTasks.length === 0) {
      return {
        text: '查看任务列表',
        count: 0,
        hasActiveTasks: false,
        isCarousel: false,
        status: 'idle'
      };
    }
    
    // 如果有多个下载任务，轮播显示单个任务进度
    if (downloadingTasks.length > 1) {
      const currentTask = downloadingTasks[currentTaskIndex] || downloadingTasks[0];
      const progress = currentTask.totalFiles > 0 ? Math.round((currentTask.downloadedFiles / currentTask.totalFiles) * 100) : 0;
        const text = `正在导出...  [${currentTaskIndex + 1}/${downloadingTasks.length}] ${progress}%`;
      
      return {
        text,
        count: downloadingTasks.length + pendingTasks.length,
        hasActiveTasks: true,
        isCarousel: true,
        currentIndex: currentTaskIndex + 1,
        totalTasks: downloadingTasks.length,
        status: 'downloading'
      };
    }
    
    // 单个下载任务或只有等待任务
    let text = '';
    let totalCount = 0;
    let status = 'idle';
    
    if (downloadingTasks.length === 1) {
      const task = downloadingTasks[0];
      const progress = task.totalFiles > 0 ? Math.round((task.downloadedFiles / task.totalFiles) * 100) : 0;
        text = `正在导出...  [1/1] ${progress}%`;
      totalCount += 1;
      status = 'downloading';
    }
    
    if (pendingTasks.length > 0) {
      if (text) {
        text += ` +${pendingTasks.length}等待`;
      } else {
        text = `${pendingTasks.length}个任务等待中`;
        status = 'pending';
      }
      totalCount += pendingTasks.length;
    }
    
    return {
      text,
      count: totalCount,
      hasActiveTasks: true,
      isCarousel: false,
      status
    };
  };

  const activeTaskSummary = getActiveTaskSummary();

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            文件列表
            <Button
              type="text"
              onClick={onViewTasks}
              style={{ 
                padding: '4px 8px', 
                fontSize: '13px',
                color: activeTaskSummary.hasActiveTasks ? '#1890ff' : '#666'
              }}
            >
              {activeTaskSummary.text}
            </Button>
          </div>
        } 
        extra={
          <Button 
            type="primary" 
            icon={<DownloadOutlined />}
            disabled={!selectedKeys.length || creating}
            loading={creating}
            onClick={handleExport}
          >
            {creating ? '正在导出...' : '导出'}
          </Button>
        }
      >
        <Spin spinning={loading}>
          <div style={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}>
            <Tree
              checkable
              showIcon
              loadData={onLoadData}
              treeData={treeData}
              checkedKeys={selectedKeys}
              expandedKeys={expandedKeys}
              onExpand={onExpand}
              onCheck={keys => setSelectedKeys(keys as string[])}
            />
          </div>
        </Spin>
      </Card>
    </Space>
  );
};

export default HomePage;