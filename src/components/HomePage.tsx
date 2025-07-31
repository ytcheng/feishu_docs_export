import React, { useState, useEffect } from 'react';
import 'antd/dist/reset.css'; 
import { Card, Tree, Button, Space, Spin, App } from 'antd';
import { 
  DownloadOutlined, 
  FolderOutlined, 
  BookOutlined, 
  HomeOutlined,
  FileTextOutlined,
  TableOutlined,
  DatabaseOutlined,
  PaperClipOutlined,
  FolderOpenOutlined,
  CloudOutlined
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { type FeishuWikiRoot, type FeishuWikiSpace, type FeishuWikiNode, type FeishuFile, type FeishuFolder, type FeishuRootMeta, type FeishuWikiRootTreeNode, type FeishuWikiSpaceTreeNode, type FeishuWikiTreeNode, type FeishuFileTreeNode, type FeishuFolderTreeNode, type FeishuRootMetaTreeNode, type TreeNode} from '../types';
import { type DownloadTask, type DownloadFile, FileStatus, TaskStatus } from '../types/database';
import { driveApi } from '../utils/drive';
import { createDownloadTask, startDownloadTask, getDownloadTasks } from '../utils/taskManager';


const iconStyle = {
  fontSize: '16px'
};

function createWikiRootTreeNode(fileItem: FeishuWikiRoot, parentPath: string[]): FeishuWikiRootTreeNode {
  return {
    title: "知识库",
    key: "wiki_root",
    type: 'FeishuWikiRoot',
    icon: <HomeOutlined style={{ ...iconStyle, color: '#722ed1' }} />,
    fileItem,
    isLeaf: false,
    path: parentPath,
    loadChildren: async () => {
      const spaces = await driveApi.getWikiSpaces();
      return spaces.map((space) => createWikiSpaceTreeNode(space, [...parentPath, "知识库"]));
    }
  };
}
function createWikiSpaceTreeNode(fileItem: FeishuWikiSpace, parentPath: string[]): FeishuWikiSpaceTreeNode {
  return {
    title: fileItem.name,
    key: fileItem.space_id,
    type: 'FeishuWikiSpace',
    icon: <BookOutlined style={{ ...iconStyle, color: '#52c41a' }} />,
    fileItem,
    isLeaf: false,
    path: parentPath,
    loadChildren: async () => {
      const nodes = await driveApi.getWikiSpaceNodes(fileItem.space_id, undefined);
      return nodes.map((node) => createWikiNodeTreeNode(node, [...parentPath, fileItem.name]));
    }
  };
}
function createWikiNodeTreeNode(fileItem: FeishuWikiNode, parentPath: string[]): FeishuWikiTreeNode {
  return {
    title: fileItem.title,
    key: fileItem.node_token,
    type: 'FeishuWikiNode',
    icon: fileItem.has_child ?  <FolderOpenOutlined style={{ ...iconStyle, color: '#fa8c16' }} /> : <FileTextOutlined style = {{ ...iconStyle, color: '#13c2c2'}} />,
    fileItem,
    isLeaf: !fileItem.has_child,
    path: parentPath,
    loadChildren: async () => {
      if (!fileItem.has_child) {
        return [];
      }
      const nodes = await driveApi.getWikiSpaceNodes(fileItem.space_id, fileItem.node_token);
      return nodes.map((node) => createWikiNodeTreeNode(node, [...parentPath, fileItem.title]));
    }
  };
}
function createFileTreeNode(fileItem: FeishuFile, parentPath: string[]): FeishuFileTreeNode {
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
  return {
    title: fileItem.name === '' ? "未命名文件" : fileItem.name,
    key: fileItem.token,
    type: 'FeishuFile',
    icon,
    fileItem,
    isLeaf: true,
    path: parentPath,
    loadChildren: async () => [],
  };
}
function createFolderTreeNode(fileItem: FeishuFolder, parentPath: string[]): FeishuFolderTreeNode {
  return {
    title: fileItem.name,
    key: fileItem.token,
    type: 'FeishuFolder',
    icon: <FolderOutlined style={{ ...iconStyle, color: '#1890ff' }} />,
    fileItem,
    isLeaf: false,
    path: parentPath,
    loadChildren: async () => {
      const files = await driveApi.getFolderFiles(fileItem.token);
      return files.map((file) => {
        if (file.type === 'folder') {
          return createFolderTreeNode(file, [...parentPath, fileItem.name]);
        }
        return createFileTreeNode(file, [...parentPath, fileItem.name]);
      });
    }
  };
}
function createRootMetaTreeNode(fileItem: FeishuRootMeta, parentPath: string[]): FeishuRootMetaTreeNode {
  return {
    title: fileItem.name ?? "云盘",
    key: fileItem.token,
    type: 'FeishuRootMeta',
    icon: <CloudOutlined style={{ ...iconStyle, color: '#fa541c' }} />,
    fileItem,
    isLeaf: false,
    path: parentPath,
    loadChildren: async () => {
      const files = await driveApi.getFolderFiles(fileItem.token);
      return files.map((file) => {
        if (file.type === 'folder') {
          return createFolderTreeNode(file, [...parentPath, fileItem.name ?? "云盘"]);
        }
        return createFileTreeNode(file, [...parentPath, fileItem.name ?? "云盘"]);
      });
    }
  };
}

interface HomePageProps {
  onViewTasks: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onViewTasks }) => {
  const { message } = App.useApp();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [_tasksLoading, setTasksLoading] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

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
      const rootMeta = await driveApi.getRootFolderMeta();
      console.log("loadRootData rootMeta", rootMeta);
      if (!rootMeta) {
        return;
      }

      const driveRoot = createRootMetaTreeNode(rootMeta, []);

      const wikiRoot = createWikiRootTreeNode({ name: "知识库" }, []);

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
   * 根据选中的节点获取所有需要下载的文件
   */
  const getSelectedNodes = async (): Promise<Array<TreeNode>> => {
    const allNodes: Array<TreeNode> = [];
    
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
    
    
    for (const key of selectedKeys) {
      const node = findNodeByKey(treeData, key);
      if (!node) continue;
      allNodes.push(node!);
    }
    return allNodes;
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
      
      const nodesToDownload = await getSelectedNodes();
      
      if (nodesToDownload.length === 0) {
        message.warning('未找到可下载的文件');
        return;
      }

      const downloadedFiles: DownloadFile[] = nodesToDownload.map((node) => {
        return {
          name: node.title,
          path: node.path.map((name) => name.trim().replace(/[\\\/:\*\?"<>\|]/g, "_")).join('/'),//处理路径中的特殊字符，并拼接
          status: FileStatus.PENDING,
          type: node.type,
          isLeaf: node.isLeaf??false,
          isExpanded: false,
          fileInfo: node.fileItem
        }
      }); 
      
      // const task: Omit<DownloadTaskRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      //   name: `导出任务 - ${new Date().toLocaleString()}`,
      //   outputPath: selected,
      //   selectedNodes: nodesToDownload
      // };
      const downloadTask: DownloadTask = {
        name: `导出任务 - ${new Date().toLocaleString()}`,
        outputPath: selected,
        status: TaskStatus.PENDING,
        progress: 0,
        totalFiles: nodesToDownload.length,
        downloadedFiles: 0,
        failedFiles: 0,
        files: downloadedFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const newtask = await createDownloadTask(downloadTask);
      
      message.success(`成功创建导出任务，共 ${nodesToDownload.length} 个文件`);
      setSelectedKeys([]);
      startDownloadTask(newtask.id!);
      
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
      const allTasks = await getDownloadTasks();
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
        text = `${pendingTasks.length}个任务等待中，正获取下载文件列表`;
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