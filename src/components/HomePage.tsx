import React, { useState, useEffect } from 'react';
import { Card, Tree, Button, Space, message, Spin, Typography, Badge } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriApi } from '../utils/tauriApi';
import type { DownloadTask, DownloadFile } from '../types';

// 文件项接口
interface FileItem {
  token: string;
  name: string;
  type: 'folder' | 'wiki_space' | 'wiki_root' | 'wiki_node' | 'doc' | 'docx' | 'sheet' | 'bitable' | 'file';
  space_id?: string;
  node_type?: string;
  obj_type?: string;
  obj_token?: string;
  has_child?: boolean;
}


interface TreeNode {
  title: string;
  key: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  children?: TreeNode[];
  fileItem: FileItem;
}

interface HomePageProps {
  onViewTasks: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onViewTasks }) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savePath, setSavePath] = useState('');
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  /**
   * 根据文件类型获取图标
   */
  const getFileIcon = (type: string, hasChild?: boolean) => {
    const iconStyle = { fontSize: '16px' };
    
    switch (type) {
      case 'folder':
        return <span style={{ ...iconStyle, color: '#1890ff' }}>📁</span>;
      case 'wiki_space':
        return <span style={{ ...iconStyle, color: '#52c41a' }}>📚</span>;
      case 'wiki_root':
        return <span style={{ ...iconStyle, color: '#722ed1' }}>🏠</span>;
      case 'wiki_node':
        if (hasChild) {
          return <span style={{ ...iconStyle, color: '#fa8c16' }}>📂</span>;
        }
        return <span style={{ ...iconStyle, color: '#13c2c2' }}>📄</span>;
      case 'doc':
      case 'docx':
        return <span style={{ ...iconStyle, color: '#1890ff' }}>📝</span>;
      case 'sheet':
        return <span style={{ ...iconStyle, color: '#52c41a' }}>📊</span>;
      case 'bitable':
        return <span style={{ ...iconStyle, color: '#722ed1' }}>🗃️</span>;
      case 'file':
        return <span style={{ ...iconStyle, color: '#fa541c' }}>📎</span>;
      default:
        return <span style={{ ...iconStyle, color: '#8c8c8c' }}>📄</span>;
    }
  };

  /**
   * 将文件列表转换为树形数据
   */
  const convertToTreeData = (files: FileItem[]): TreeNode[] => {
    return files.map(file => {
      // 判断是否为叶子节点：文件类型且不是文件夹类型
      const isLeaf = file.type !== 'folder' && 
                     file.type !== 'wiki_space' && 
                     file.type !== 'wiki_root' && 
                     (file.type !== 'wiki_node' || !file.has_child);
      
      return {
        title: file.name || '未命名',
        key: file.token,
        icon: getFileIcon(file.type, file.has_child),
        isLeaf,
        fileItem: file
      };
    });
  };

  /**
   * 获取文件夹文件列表
   */
  const getFolderFiles = async (folderToken?: string): Promise<FileItem[]> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return [];
      }
      
      const response = await tauriApi.getFolderFiles(accessToken, folderToken, 20);
      
      if (response.code === 0 && response.data) {
        const allFiles = [
          ...(response.data.folders || []).map(folder => ({
            ...folder,
            type: 'folder' as const,
            has_child: true // 文件夹默认可以展开
          })),
          ...(response.data.files || []).map(file => ({
            ...file,
            type: file.type as FileItem['type'],
            has_child: false // 文件不能展开
          }))
        ];
        return allFiles;
      } else {
        message.error(`获取文件列表失败: ${response.msg}`);
        return [];
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error('获取文件列表失败');
      return [];
    }
  };

  /**
   * 获取知识空间列表
   */
  const getWikiSpaces = async (): Promise<FileItem[]> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return [];
      }
      
      const response = await tauriApi.getWikiSpaces(accessToken, 20);
      
      if (response.code === 0 && response.data) {
        return (response.data.items || []).map((space: any) => ({
          token: space.space_id,
          name: space.name || '未命名知识空间',
          type: 'wiki_space' as const,
          space_id: space.space_id,
          has_child: true // 知识空间默认可以展开
        }));
      } else {
        message.error(`获取知识空间列表失败: ${response.msg}`);
        return [];
      }
    } catch (error) {
      console.error('获取知识空间列表失败:', error);
      message.error('获取知识空间列表失败');
      return [];
    }
  };

  /**
   * 获取知识空间子节点列表
   */
  const getWikiSpaceNodes = async (spaceId?: string, parentToken?: string): Promise<FileItem[]> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return [];
      }
      
      if (!spaceId) {
        message.error('知识空间ID不能为空');
        return [];
      }
      
      const response = await tauriApi.getWikiSpaceNodes(accessToken, spaceId, parentToken);
      
      if (response.code === 0 && response.data) {
        return (response.data.items || []).map((node: any) => ({
          token: node.node_token,
          name: node.title || '未命名节点',
          type: 'wiki_node' as const,
          space_id: spaceId,
          node_type: node.node_type,
          obj_type: node.obj_type,
          obj_token: node.obj_token,
          has_child: node.has_child
        }));
      } else {
        message.error(`获取知识空间子节点失败: ${response.msg}`);
        return [];
      }
    } catch (error) {
      console.error('获取知识空间子节点失败:', error);
      message.error('获取知识空间子节点失败');
      return [];
    }
  };

  /**
   * 获取根文件夹元数据
   */
  const getRootFolderMeta = async (): Promise<any> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return null;
      }
      
      const response = await tauriApi.getRootFolderMeta(accessToken);
      
      if (response.code === 0 && response.data) {
        return response.data;
      } else {
        message.error(`获取根文件夹失败: ${response.msg}`);
        return null;
      }
    } catch (error) {
      console.error('获取根文件夹失败:', error);
      message.error('获取根文件夹失败');
      return null;
    }
  };

  /**
   * 动态加载子节点数据
   */
  const onLoadData = async ({ key, children, fileItem }: TreeNode): Promise<void> => {
    if (children && children.length > 0) {
      return;
    }

    try {
      let files: FileItem[] = [];
      
      if (fileItem.type === 'folder') {
        files = await getFolderFiles(fileItem.token);
      } else if (fileItem.type === 'wiki_space') {
        files = await getWikiSpaceNodes(fileItem.space_id!);
      } else if (fileItem.type === 'wiki_root') {
        files = await getWikiSpaces();
      } else if (fileItem.type === 'wiki_node' && fileItem.has_child) {
        files = await getWikiSpaceNodes(fileItem.space_id!, fileItem.token);
      }

      const newTreeData = convertToTreeData(files);
      
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
      const rootMeta = await getRootFolderMeta();
      if (!rootMeta) {
        return;
      }

      const driveRoot: TreeNode = {
        title: '云盘',
        key: rootMeta.token,
        icon: getFileIcon('folder'),
        isLeaf: false,
        children: [],
        fileItem: {
          token: rootMeta.token,
          name: '云盘',
          type: 'folder',
          has_child: true
        }
      };

      const wikiRoot: TreeNode = {
        title: '知识库',
        key: 'wiki_root',
        icon: getFileIcon('wiki_root'),
        isLeaf: false,
        children: [],
        fileItem: {
          token: 'wiki_root',
          name: '知识库',
          type: 'wiki_root',
          has_child: true
        }
      };

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

  /**
   * 选择保存目录
   */
  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      
      if (selected && typeof selected === 'string') {
        setSavePath(selected);
        message.success('保存目录选择成功');
      }
    } catch (error) {
      console.error('选择目录失败:', error);
      message.error('选择目录失败');
    }
  };

  /**
   * 构建文件路径
   */
  const buildFilePath = (file: FileItem, pathFromRoot: string[]): string => {
    const pathParts = [...pathFromRoot];
    if (file.name && file.name !== '云盘' && file.name !== '知识库') {
      pathParts.push(file.name);
    }
    return pathParts.join('/');
  };

  /**
   * 递归获取文件夹下所有文件（带路径）
   */
  const getAllFilesFromFolderWithPath = async (
    token: string, 
    type: string, 
    spaceId?: string, 
    currentPath: string[] = []
  ): Promise<Array<FileItem & { fullPath: string }>> => {
    const allFiles: Array<FileItem & { fullPath: string }> = [];
    
    try {
      let files: FileItem[] = [];
      
      if (type === 'folder') {
        files = await getFolderFiles(token);
      } else if (type === 'wiki_space') {
        files = await getWikiSpaceNodes(spaceId!, token);
      } else if (type === 'wiki_root') {
        files = await getWikiSpaces();
      } else if (type === 'wiki_node') {
        files = await getWikiSpaceNodes(spaceId!, token);
      }
      
      for (const file of files) {
        if (file.has_child && (file.type === 'folder' || file.type === 'wiki_node')) {
          const newPath = [...currentPath];
          if (file.name && file.name !== '云盘' && file.name !== '知识库') {
            newPath.push(file.name);
          }
          
          if (file.type === 'wiki_node') {
            const fullPath = buildFilePath(file, currentPath);
            allFiles.push({ ...file, fullPath });
          }
          const subFiles = await getAllFilesFromFolderWithPath(file.token, file.type, file.space_id || spaceId, newPath);
          allFiles.push(...subFiles);
        } else {
          const fullPath = buildFilePath(file, currentPath);
          allFiles.push({ ...file, fullPath });
        }
      }
    } catch (error) {
      console.error(`获取文件夹 ${token} 下的文件失败:`, error);
    }
    
    return allFiles;
  };

  /**
   * 根据选中的节点获取所有需要下载的文件
   */
  const getSelectedFiles = async (): Promise<Array<FileItem & { fullPath: string }>> => {
    const allFiles: Array<FileItem & { fullPath: string }> = [];
    
    const findNodeByKey = (nodes: TreeNode[], key: string): TreeNode | null => {
      for (const node of nodes) {
        if (node.key === key) {
          return node;
        }
        if (node.children) {
          const found = findNodeByKey(node.children, key);
          if (found) return found;
        }
      }
      return null;
    };
    
    const getNodePath = (nodes: TreeNode[], targetKey: string, currentPath: string[] = []): string[] | null => {
      for (const node of nodes) {
        const newPath = [...currentPath];
        newPath.push(node.fileItem.name);
        
        if (node.key === targetKey) {
          return newPath;
        }
        
        if (node.children) {
          const found = getNodePath(node.children, targetKey, newPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    for (const key of selectedKeys) {
      const node = findNodeByKey(treeData, key);
      if (!node) continue;
      
      const fileItem = node.fileItem;
      const nodePath = getNodePath(treeData, key);
      const pathFromRoot = nodePath ? nodePath.slice(0, -1) : [];
      
      if (fileItem.type === 'folder' || fileItem.type === 'wiki_root' || fileItem.type === 'wiki_space' || (fileItem.type === 'wiki_node' && fileItem.has_child)) {
        if (fileItem.type === 'wiki_node') {
          const fullPath = buildFilePath(fileItem, nodePath || []);
          allFiles.push({ ...fileItem, fullPath });
        }
        const folderFiles = await getAllFilesFromFolderWithPath(fileItem.token, fileItem.type, fileItem.space_id, nodePath || []);
        allFiles.push(...folderFiles);
      } else {
        const fullPath = buildFilePath(fileItem, pathFromRoot);
        allFiles.push({ ...fileItem, fullPath });
      }
    }
    
    return allFiles;
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
      
      const downloadFiles: DownloadFile[] = filesToDownload.map(file => {
        let actualType: DownloadFile['type'] = file.type;
        let actualToken: string = file.token;
        
        if (file.type === 'wiki_node' && file.obj_type) {
          const validTypes: DownloadFile['type'][] = ['doc', 'docx', 'sheet', 'bitable', 'file'];
          actualType = validTypes.includes(file.obj_type as DownloadFile['type']) 
            ? (file.obj_type as DownloadFile['type']) 
            : 'doc';
          actualToken = file.obj_token || file.token;
        }
        
        return {
          token: actualToken,
          name: file.name || '未命名文件',
          type: actualType,
          spaceId: file.space_id,
          relativePath: file.fullPath,
          status: 'pending' as const,
          progress: 0
        };
      });
      
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

  /**
   * 获取当前活跃任务的简要信息
   */
  const getActiveTaskSummary = () => {
    if (tasks.length === 0) {
      return null;
    }
    
    const downloadingTasks = tasks.filter(task => task.status === 'downloading');
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    
    if (downloadingTasks.length > 0) {
      const task = downloadingTasks[0];
      return {
        text: `正在导出 ${task.downloadedFiles}/${task.totalFiles}`,
        progress: task.progress,
        status: 'downloading'
      };
    }
    
    if (pendingTasks.length > 0) {
      return {
        text: `等待导出 ${pendingTasks.length} 个任务`,
        progress: 0,
        status: 'pending'
      };
    }
    
    return null;
  };

  const activeTaskSummary = getActiveTaskSummary();

  return (
    <div style={{ padding: '24px' }}>
      
      <Card 
        title="" 
        extra={
          <Space>
            {activeTaskSummary && (
              <Button 
                type="link" 
                onClick={onViewTasks}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                <Badge 
                  status={activeTaskSummary.status === 'downloading' ? 'processing' : 'default'} 
                  text={activeTaskSummary.text}
                />
              </Button>
            )}
            <Button 
              type="primary" 
              icon={<DownloadOutlined />}
              disabled={!selectedKeys.length || creating}
              loading={creating}
              onClick={handleExport}
            >
              {creating ? '正在导出...' : '导出'}
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <div style={{ height: 'calc(100vh - 220px)', overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: '6px', padding: '8px' }}>
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
    </div>
  );
};

export default HomePage;