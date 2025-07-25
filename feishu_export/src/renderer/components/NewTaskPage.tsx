import React, { useState, useEffect } from 'react';
import { Card, Tree, Input, Button, Space, Spin, message } from 'antd';
import { 
  FolderOpenOutlined, 
  FolderOutlined, 
  FileOutlined,
  FileTextOutlined,
  TableOutlined,
  BranchesOutlined,
  DatabaseOutlined,
  FileWordOutlined,
  LinkOutlined
} from '@ant-design/icons';
import type { TreeDataNode } from 'antd';

interface FileItem {
  token: string;
  name: string;
  type: 'folder' | 'file' | 'doc' | 'sheet' | 'mindnote' | 'bitable' | 'docx' | 'shortcut' | 'wiki_root' | 'wiki_space' | 'wiki_node';
  parent_token?: string;
  url?: string;
  created_time?: string;
  modified_time?: string;
  space_id?: string; // 知识空间ID
  node_type?: string; // 知识库节点类型
  obj_type?: string; //知识库文档任型
  obj_token?: string;//知识库文档token
  has_child?: boolean; // 是否有子节点（仅用于知识库节点）
}

// 引入全局类型定义
type DownloadTask = globalThis.DownloadTask;
type DownloadFile = globalThis.DownloadFile;

interface TreeNode extends TreeDataNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  children?: TreeNode[];
  fileItem: FileItem;
}

interface NewTaskPageProps {
  onTaskCreated?: () => void;
}

const NewTaskPage: React.FC<NewTaskPageProps> = ({ onTaskCreated }) => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [savePath, setSavePath] = useState('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [creating, setCreating] = useState(false);

  /**
   * 获取根文件夹元数据
   */
  const getRootFolderMeta = async (): Promise<{ token: string; id: string; user_id: string } | null> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return null;
      }

      const response = await window.electronAPI.getRootFolderMeta(accessToken);
      console.log('根文件夹元数据:', response);
      
      if (response.code === 0) {
        return response.data;
      } else {
        message.error(`获取根文件夹失败: ${response.msg}`);
        return null;
      }
    } catch (error) {
      console.error('获取根文件夹元数据失败:', error);
      message.error('获取根文件夹元数据失败');
      return null;
    }
  };

  /**
   * 获取文件夹中的文件列表
   */
  const getFolderFiles = async (folderToken?: string): Promise<FileItem[]> => {
    try {
      const accessToken = localStorage.getItem('feishu_access_token');
      if (!accessToken) {
        message.error('未找到访问令牌，请重新登录');
        return [];
      }
      console.log("folderToken", folderToken);
      const response = await window.electronAPI.getFolderFiles(accessToken, folderToken, 200);
      console.log('文件列表响应:', response);
      
      if (response.code === 0) {
        return response.data.files || [];
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
      
      const response = await window.electronAPI.getWikiSpaces(accessToken, 20);
      console.log('知识空间列表响应:', response);
      
      if (response.code === 0) {
        return (response.data.items || []).map((space: any) => ({
          token: space.space_id,
          name: space.name || '未命名知识空间',
          type: 'wiki_space' as const,
          space_id: space.space_id
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
    console.log("getWikiSpaceNodes", spaceId, parentToken);
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
      
      const response = await window.electronAPI.getWikiSpaceNodes(accessToken, spaceId, parentToken);
      console.log('知识空间子节点响应:', response);
      
      if (response.code === 0) {
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
   * 根据文件类型获取对应图标
   */
  const getFileIcon = (fileType: string, hasChild?: boolean) => {
    switch (fileType) {
      case 'folder':
      case 'wiki_space':
        return <FolderOutlined />;
      case 'wiki_node':
        // 知识库节点：只有当 has_child 为 true 时才显示为文件夹，否则显示为 docx 文档
        return hasChild ? <FolderOutlined /> : <FileWordOutlined />;
      case 'doc':
        return <FileTextOutlined />;
      case 'docx':
        return <FileWordOutlined />;
      case 'sheet':
        return <TableOutlined />;
      case 'mindnote':
        return <BranchesOutlined />;
      case 'bitable':
        return <DatabaseOutlined />;
      case 'shortcut':
        return <LinkOutlined />;
      case 'file':
      default:
        return <FileOutlined />;
    }
  };

  /**
   * 将文件列表转换为树形数据
   */
  const convertToTreeData = (files: FileItem[], parentToken?: string): TreeNode[] => {
    return files.map(file => {
      // 对于知识库节点，只有当 has_child 为 true 时才能展开
      const canExpand = file.type === 'wiki_node' ? file.has_child : ['folder', 'wiki_space'].includes(file.type);
      
      return {
        key: file.token,
        title: file.name || '未命名文件',
        icon: getFileIcon(file.type, file.has_child),
        isLeaf: !canExpand,
        children: canExpand ? [] : undefined,
        fileItem: file
      };
    });
  };

  /**
   * 动态加载子节点数据
   */
  const onLoadData = async (node: TreeNode): Promise<void> => {
    if (node.children && node.children.length > 0) {
      return;
    }
    console.log("expand token", node.fileItem.token, "type", node.fileItem.type);
    
    let childNodes: TreeNode[] = [];
    
    if (node.fileItem.type === 'folder') {
      const files = await getFolderFiles(node.fileItem.token);
      childNodes = convertToTreeData(files, node.fileItem.token);
    } else if (node.fileItem.type === 'wiki_root') {
      // 知识库根节点，加载知识空间列表
      const spaces = await getWikiSpaces();
      childNodes = convertToTreeData(spaces, 'wiki_root');
    } else if (node.fileItem.type === 'wiki_space') {
      const nodes = await getWikiSpaceNodes(node.fileItem.space_id!);
      childNodes = convertToTreeData(nodes, node.fileItem.token);
    } else if (node.fileItem.type === 'wiki_node') {
      const nodes = await getWikiSpaceNodes(node.fileItem.space_id!, node.fileItem.token);
      childNodes = convertToTreeData(nodes, node.fileItem.token);
    }
    
    setTreeData(prevData => {
      const updateNode = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(item => {
          if (item.key === node.key) {
            return { ...item, children: childNodes };
          }
          if (item.children) {
            return { ...item, children: updateNode(item.children) };
          }
          return item;
        });
      };
      return updateNode(prevData);
    });
  };

  /**
   * 加载根目录数据
   */
  const loadRootData = async () => {
    setLoading(true);
    try {
      const rootMeta = await getRootFolderMeta();
      if (rootMeta) {
        // 创建云盘根节点
        const cloudRootNode: TreeNode = {
          key: rootMeta.token,
          title: '云盘',
          icon: <FolderOutlined />,
          isLeaf: false,
          children: [],
          fileItem: {
            token: rootMeta.token,
            name: '云盘',
            type: 'folder'
          }
        };
        
        // 创建知识库根节点
        const wikiRootNode: TreeNode = {
          key: 'wiki_root',
          title: '知识库',
          icon: <FolderOutlined />,
          isLeaf: false,
          children: [],
          fileItem: {
            token: 'wiki_root',
            name: '知识库',
            type: 'wiki_root'
          }
        };
        
        setTreeData([cloudRootNode, wikiRootNode]);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理树节点展开
   */
  const onExpand = (expandedKeysValue: React.Key[]) => {
    setExpandedKeys(expandedKeysValue);
  };

  /**
   * 选择保存目录
   */
  const handleSelectDirectory = async () => {
    try {
      const selectedPath = await window.electronAPI.selectDirectory();
      if (selectedPath) {
        setSavePath(selectedPath);
      }
    } catch (error) {
      console.error('选择目录失败:', error);
      message.error('选择目录失败');
    }
  };

  /**
   * 构建文件的相对路径，保持与树形结构一致的目录层级
   */
  const buildFilePath = (file: FileItem, pathFromRoot: string[] = []): string => {
    
    // 构建完整路径：根目录 + 路径层级 + 文件名
    const fullPath = pathFromRoot.filter(Boolean).join('/');
    return fullPath;
  };

  /**
   * 递归获取文件夹下所有文件，并构建正确的路径结构
   */
  const getAllFilesFromFolderWithPath = async (
    token: string, 
    type: string, 
    spaceId?: string, 
    currentPath: string[] = []
  ): Promise<Array<FileItem & { fullPath: string }>> => {
    const allFiles: Array<FileItem & { fullPath: string }> = [];
    console.log("getAllFilesFromFolderWithPath", token, type, spaceId, currentPath);
    try {
      let childFiles: FileItem[] = [];
      
      if (type === 'folder') {
        childFiles = await getFolderFiles(token);
      } else if (type === 'wiki_root') {
        childFiles = await getWikiSpaces();
      } else if (type === 'wiki_space') {
        childFiles = await getWikiSpaceNodes(spaceId!);
      } else if (type === 'wiki_node' && spaceId) {
        childFiles = await getWikiSpaceNodes(spaceId, token);
      }
      
      for (const file of childFiles) {
        if (file.type === 'folder' || file.type == 'wiki_root' || file.type === 'wiki_space' || (file.type === 'wiki_node' && file.has_child)) {
          // 递归获取子文件夹的文件，传递当前路径
          const newPath = [...currentPath, file.name || '未命名文件夹'];
          if(file.type === 'wiki_node'){
            const fullPath = buildFilePath(file, currentPath);
            allFiles.push({ ...file, fullPath });
          }
          const subFiles = await getAllFilesFromFolderWithPath(file.token, file.type, file.space_id || spaceId, newPath);
          allFiles.push(...subFiles);
        } else {
          // 叶子节点文件，构建完整路径
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
    
    // 找到选中的节点
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

    console.log("getSelectedFiles findNodeByKey", findNodeByKey);
    
    // 构建节点路径的辅助函数
    const getNodePath = (nodes: TreeNode[], targetKey: string, currentPath: string[] = []): string[] | null => {
      for (const node of nodes) {
        const newPath = [...currentPath];
        
        // 跳过根节点（云盘和知识库）
        console.log("getNodePath node.key", node.key, "node.fileItem.token", node.fileItem.token, "node.fileItem.type", node.fileItem.type, "node.fileItem.name", node.fileItem.name);
        // if (node.key !== node.fileItem.token || (node.fileItem.type !== 'folder' && node.fileItem.type !== 'wiki_space')) {
          // if (node.fileItem.name && node.fileItem.name !== '云盘' && node.fileItem.name !== '知识库') {
            newPath.push(node.fileItem.name);
          // }
        // }
        
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
    console.log("getSelectedFiles getNodePath", getNodePath);
    
    for (const key of selectedKeys) {
      const node = findNodeByKey(treeData, key);
      if (!node) continue;
      
      const fileItem = node.fileItem;
      const nodePath = getNodePath(treeData, key);
      console.log("getSelectedFiles nodePath", nodePath, "key", key);
      const pathFromRoot = nodePath ? nodePath.slice(0, -1) : []; // 移除文件名本身
      
      if (fileItem.type === 'folder' || fileItem.type === 'wiki_root' || fileItem.type === 'wiki_space' || (fileItem.type === 'wiki_node' && fileItem.has_child)) {
        if (fileItem.type === 'wiki_node') {
          const fullPath = buildFilePath(fileItem, nodePath || []);
          allFiles.push({ ...fileItem, fullPath });
        }
        // 文件夹类型，获取其下所有文件
        const folderFiles = await getAllFilesFromFolderWithPath(fileItem.token, fileItem.type, fileItem.space_id, nodePath || []);
        allFiles.push(...folderFiles);
      } else {
        // 单个文件，构建路径
        const fullPath = buildFilePath(fileItem, pathFromRoot);
        allFiles.push({ ...fileItem, fullPath });
      }
    }
    
    return allFiles;
  };

  /**
   * 创建下载任务
   */
  const handleCreateDownloadTask = async () => {
    if (!selectedKeys.length || !savePath) {
      message.warning('请选择文件和保存路径');
      return;
    }
    
    setCreating(true);
    setLoading(true);
    try {
      message.info('正在分析选中的文件，请稍候...');
      
      // 异步获取所有需要下载的文件
      const filesToDownload = await getSelectedFiles();
      
      if (filesToDownload.length === 0) {
        message.warning('未找到可下载的文件');
        return;
      }
      
      // 创建下载任务
       const downloadFiles: DownloadFile[] = filesToDownload.map(file => {
         let actualType: DownloadFile['type'] = file.type;
         let actualToken: string = file.token;
         
         // 对于wiki_node类型，使用node_type作为实际类型
         if (file.type === 'wiki_node' && file.obj_type) {
           // 确保node_type是有效的文件类型
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
           status: 'pending' as const
         };
       });
       
       const task: Omit<DownloadTask, 'id' | 'createdAt' | 'updatedAt'> = {
          name: `下载任务 - ${new Date().toLocaleString()}`,
          savePath: savePath,
          files: downloadFiles,
          status: 'pending',
          progress: 0,
          totalFiles: downloadFiles.length,
          downloadedFiles: 0
        };
      
      const taskId = await window.electronAPI.createDownloadTask(task);
      
      message.success(`成功创建下载任务，共 ${filesToDownload.length} 个文件`);
      // 清空选择
      setSelectedKeys([]);
      setSavePath('');
      console.log("onTaskCreated", onTaskCreated);
      // 调用回调函数，跳转到任务列表页面
      if (onTaskCreated) {
        console.log("onTaskCreated");
        onTaskCreated();
      }
      // 自动开始下载任务
      try {
        const accessToken = localStorage.getItem('feishu_access_token');
        if (accessToken) {
          message.info('正在开始下载任务...');
          await window.electronAPI.executeDownloadTask(taskId, accessToken);
          message.success('下载任务已开始');
        } else {
          message.warning('未找到访问令牌，请手动开始下载任务');
        }
      } catch (executeError) {
        console.error('自动开始下载任务失败:', executeError);
        // 提取错误信息
        let errorMessage = '自动开始下载失败，请手动开始';
        if (executeError && typeof executeError === 'object') {
          // 检查是否是AxiosError类型的飞书API错误响应
          if ('response' in executeError && executeError.response && 
              typeof executeError.response === 'object' && 'data' in executeError.response &&
              executeError.response.data && typeof executeError.response.data === 'object' && 
              'msg' in executeError.response.data) {
            errorMessage = `自动开始下载失败: ${executeError.response.data.msg}`;
          } else if ('data' in executeError && executeError.data && typeof executeError.data === 'object' && 'msg' in executeError.data) {
            errorMessage = `自动开始下载失败: ${executeError.data.msg}`;
          } else if ('message' in executeError) {
            errorMessage = `自动开始下载失败: ${executeError.message}`;
          }
        } else if (typeof executeError === 'string') {
          errorMessage = `自动开始下载失败: ${executeError}`;
        }
        message.warning(errorMessage);
      }
      
      
      
    } catch (error) {
      console.error('创建下载任务失败:', error);
      message.error('创建下载任务失败');
    } finally {
      setLoading(false);
      setCreating(false);
    }
  };

  /**
   * 组件挂载时加载数据
   */
  useEffect(() => {
    loadRootData();
  }, []);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="选择要导出的知识库/云空间">
        <Spin spinning={loading}>
          <div style={{ height: 'calc(100vh - 450px)', overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: '6px', padding: '8px' }}>
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
      <Card title="选择保存目录">
        <Space>
          <Input style={{ width: 300 }} value={savePath} placeholder="请选择保存路径" readOnly />
          <Button icon={<FolderOpenOutlined />} onClick={handleSelectDirectory}>选择目录</Button>
        </Space>
      </Card>
      <Space>
        <Button 
          type="primary" 
          disabled={!selectedKeys.length || !savePath || creating} 
          loading={creating}
          onClick={handleCreateDownloadTask}
        >
          {creating ? '正在创建...' : '创建下载任务'}
        </Button>
        <Button onClick={onTaskCreated}>取消</Button>
      </Space>
    </Space>
  );
};

export default NewTaskPage;