import React, { useState, useEffect } from 'react';
import { Card, Table, Progress, Space, Button, Tag, message, Popconfirm, Typography, Spin, Tooltip } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined, PlayCircleOutlined, ArrowLeftOutlined, StopOutlined } from '@ant-design/icons';
import { DownloadTask, DownloadFile } from '../types';
import { tauriApi } from '../utils/tauriApi';

const { Text } = Typography;

interface TaskListPageProps {
  onGoBack?: () => void;
}

/**
 * 下载任务列表页面组件
 */
const TaskListPage: React.FC<TaskListPageProps> = ({ onGoBack }) => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);



  /**
   * 加载下载任务列表
   */
  const loadTasks = async () => {
    setLoading(true);
    try {
      const taskList = await tauriApi.getDownloadTasks();
      console.log("loadTasks", taskList);
      setTasks(taskList);
    } catch (error) {
      console.error('获取下载任务列表失败:', error);
      message.error('获取下载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 删除下载任务
   */
  const handleDeleteTask = async (taskId: string) => {
    try {
      console.log("handleDeleteTask", taskId);
      await tauriApi.deleteDownloadTask(taskId);
      message.success('任务删除成功');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('删除任务失败:', error);
      message.error('删除任务失败');
    }
  };

  /**
   * 打开保存目录
   */
  const handleOpenSaveDir = async (outputPath: string) => {
    try {
      await tauriApi.openDirectory(outputPath);
    } catch (error) {
      console.error('打开目录失败:', error);
      message.error('打开目录失败');
    }
  };

  /**
   * 开始下载任务
   */
  const handleStartDownload = async (taskId: string) => {
    try {
      // 从localStorage获取访问令牌
      const access_token = localStorage.getItem('feishu_access_token');
      if (!access_token) {
        message.error('请先登录飞书账号');
        return;
      }
      
      message.info('任务开始下载，请稍候...');
      await tauriApi.executeDownloadTask(taskId, access_token);
      message.success('任务开始下载');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('开始下载失败:', error);
      message.error('开始下载失败');
    }
  };

  /**
   * 停止下载任务
   */
  const handleStopDownload = async (taskId: string) => {
    try {
      message.info('正在停止下载任务...');
      await tauriApi.stopDownloadTask(taskId);
      message.success('下载任务已停止');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('停止下载失败:', error);
      message.error('停止下载失败');
    }
  };

  /**
   * 自动恢复下载任务
   */
  const handleAutoResumeDownloadTasks = async () => {
    try {
      await tauriApi.resumeDownloadTasks();
      message.success('下载任务已恢复');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
       console.error('自动恢复下载任务失败:', error);
       message.error('自动恢复下载任务失败');
     }
   };

  /**
   * 组件挂载时加载数据
   */
  useEffect(() => {
    console.log("TaskListPage useEffect");
    loadTasks();
    
    let unlistenFunctions: (() => void)[] = [];
    
    // 监听下载进度更新
    const handleDownloadProgress = (data: any) => {
      console.log('下载进度更新:', data);
      message.info(`正在下载: ${data.current_file} (${data.completed_files}/${data.total_files})`);
      loadTasks(); // 重新加载任务列表以更新进度
    };
    
    // 监听下载完成
    const handleDownloadComplete = (data: any) => {
      console.log('下载完成:', data);
      message.success('下载任务完成！');
      loadTasks(); // 重新加载任务列表
    };
    
    // 监听下载错误
    const handleDownloadError = (data: any) => {
      console.log('下载错误:', data);
      message.error(`下载失败: ${data.error}`);
      loadTasks(); // 重新加载任务列表
    };
    
    // 监听文件下载错误
    const handleDownloadFileError = (data: any) => {
      console.log('文件下载错误:', data);
      message.error(`文件下载失败: ${data.fileName} - ${data.error}`);
      loadTasks(); // 重新加载任务列表
    };
    
    // 监听恢复下载任务通知
    const handleResumeDownloadTasks = (data: any) => {
      console.log('发现未完成的下载任务:', data);
      if (data.count > 0) {
        message.info(`发现 ${data.count} 个未完成的下载任务，正在自动恢复...`);
        // 自动调用恢复下载任务
        handleAutoResumeDownloadTasks();
      }
    };
    
    // 监听自动恢复单个任务
    const handleAutoResumeTask = async (data: any) => {
      console.log('自动恢复下载任务:', data);
      try {
        const access_token = localStorage.getItem('feishu_access_token');
        if (access_token) {
          message.info(`正在恢复下载任务: ${data.taskName}`);
          await tauriApi.executeDownloadTask(data.taskId, access_token);
          loadTasks(); // 重新加载任务列表
        }
      } catch (error) {
        console.error('自动恢复下载任务失败:', error);
      }
    };
    
    // 注册事件监听器
    const setupListeners = async () => {
      try {
        const unlistenProgress = await tauriApi.onDownloadProgress(handleDownloadProgress);
        const unlistenComplete = await tauriApi.onDownloadComplete(handleDownloadComplete);
        const unlistenError = await tauriApi.onDownloadError(handleDownloadError);
        const unlistenFileError = await tauriApi.onDownloadFileError(handleDownloadFileError);
        const unlistenAutoResume = await tauriApi.onAutoResumeTask(handleAutoResumeTask);
        
        unlistenFunctions = [
          unlistenProgress,
          unlistenComplete,
          unlistenError,
          unlistenFileError,
          unlistenAutoResume
        ];
      } catch (error) {
        console.error('设置事件监听器失败:', error);
      }
    };
    
    setupListeners();
    
    // 设置定时器定期更新任务状态
    const interval = setInterval(() => {
      loadTasks();
    }, 3000); // 每3秒更新一次
    
    return () => {
      clearInterval(interval);
      // 清理事件监听器
      unlistenFunctions.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          console.error('清理事件监听器失败:', error);
        }
      });
    };
  }, []);

  // 任务表格列定义
   const taskColumns = [
     {
       title: '任务名称',
       key: 'name',
       width: '18%',
       render: (_: any, record: DownloadTask) => {
         const createTime = new Date(record.createdAt).toLocaleString('zh-CN', {
           year: 'numeric',
           month: '2-digit',
           day: '2-digit',
           hour: '2-digit',
           minute: '2-digit'
         });
         return <span>{createTime}</span>;
       },
     },
     {
       title: '保存路径',
       dataIndex: 'outputPath',
       key: 'outputPath',
       width: '20%',
       render: (outputPath: string) => {
         const maxLength = 20;
         const displayPath = outputPath.length > maxLength 
           ? `${outputPath.slice(-maxLength)}...` 
           : outputPath;
         return (
           <Text 
             ellipsis={{ tooltip: outputPath }} 
             style={{ maxWidth: '100%', cursor: 'help' }}
           >
             {displayPath}
           </Text>
         );
       },
     },
    {
        title: '文件数量',
        key: 'fileCount',
        width: '12%',
        render: (_: any, record: DownloadTask) => (
          <span>{record.downloadedFiles}/{record.totalFiles}</span>
        ),
      },
     {
       title: '进度',
       dataIndex: 'progress',
       key: 'progress',
       width: '25%',
       render: (progress: number) => (
         <Progress percent={Math.round(progress)} size="small" />
       ),
     },
     {
       title: '状态',
       dataIndex: 'status',
       key: 'status',
       width: '8%',
       render: (status: string) => {
         const statusConfig = {
           pending: { color: 'default', text: '待下载' },
           downloading: { color: 'processing', text: '下载中' },
           completed: { color: 'success', text: '已完成' },
           failed: { color: 'error', text: '失败' },
           paused: { color: 'warning', text: '已暂停' },
           cancelled: { color: 'default', text: '已取消' },
         };
         const config = statusConfig[status as keyof typeof statusConfig] || { color: 'default', text: status };
         return <Tag color={config.color}>{config.text}</Tag>;
       },
     },
     {
        title: '操作',
        key: 'action',
        width: '8%',
       render: (_: any, record: DownloadTask) => (
         <Space>
           {record.status === 'pending' && (
              <Button
                icon={<PlayCircleOutlined />}
                size="small"
                type="primary"
                onClick={() => handleStartDownload(record.id)}
                title="开始下载"
              />
            )}
            {record.status === 'downloading' && (
              <Button
                icon={<StopOutlined />}
                size="small"
                type="default"
                onClick={() => handleStopDownload(record.id)}
                title="停止下载"
              >
                停止
              </Button>
            )}
            {(record.status === 'completed' || record.status === 'failed') && hasFailedFiles(record) && (
              <Button
                icon={<ReloadOutlined />}
                size="small"
                type="default"
                onClick={() => handleRetryFailedFiles(record.id)}
                title="重新下载失败的文件"
              >
                重试失败
              </Button>
            )}
           <Button
             icon={<FolderOpenOutlined />}
             size="small"
             onClick={() => handleOpenSaveDir(record.outputPath)}
             title="打开保存目录"
           />
           <Popconfirm
             title="确定要删除这个任务吗？"
             onConfirm={() => handleDeleteTask(record.id)}
             okText="确定"
             cancelText="取消"
           >
             <Button
               icon={<DeleteOutlined />}
               size="small"
               danger
               title="删除任务"
             />
           </Popconfirm>
         </Space>
       ),
     },
  ];

  // 文件详情表格列定义
  const fileColumns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: '10%',
      render: (type: string) => {
        const typeMap: { [key: string]: string } = {
          'file': '文件',
          'doc': '文档',
          'docx': '文档',
          'sheet': '表格',
          'bitable': '多维表格',
          'folder': '文件夹'
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '相对路径',
      dataIndex: 'relativePath',
      key: 'relativePath',
      width: '25%',
      render: (path: string) => (
        <Text ellipsis={{ tooltip: path }} style={{ maxWidth: 200 }}>
          {path}
        </Text>
      ),
    },
    {
       title: '状态',
       dataIndex: 'status',
       key: 'status',
       width: '15%',
       render: (status: string, record: DownloadFile) => {
         const fileStatusConfig = {
           pending: { color: 'orange', text: '等待中' },
           downloading: { color: 'blue', text: '下载中' },
           completed: { color: 'green', text: '已完成' },
           failed: { color: 'red', text: '失败' },
         };
         const config = fileStatusConfig[status as keyof typeof fileStatusConfig] || { color: 'default', text: status };
         const statusTag = (
           <Tag color={config.color}>
             {config.text}
           </Tag>
         );
         
         // 如果状态是失败且有错误信息，显示鼠标悬停提示
         if (status === 'failed' && record.error) {
           return (
             <Tooltip title={record.error} placement="top">
               {statusTag}
             </Tooltip>
           );
         }
         
         return statusTag;
       },
     },
     {
       title: '操作',
       key: 'action',
       width: '20%',
       render: (_: any, record: DownloadFile & { taskId: string }) => (
         <Space>
           {record.status === 'failed' && (
             <Button
               icon={<ReloadOutlined />}
               size="small"
               type="primary"
               onClick={() => handleRetryFile(record.taskId, record.token)}
               title="重试下载"
             >
               重试
             </Button>
           )}
         </Space>
       ),
     },
  ];

  /**
   * 检查任务是否有失败的文件
   */
  const hasFailedFiles = (task: DownloadTask): boolean => {
    return task.files ? task.files.some(file => file.status === 'failed') : false;
  };

  /**
   * 重试下载单个文件
   */
  const handleRetryFile = async (taskId: string, fileToken: string) => {
    try {
      const access_token = localStorage.getItem('feishu_access_token');
      if (!access_token) {
        message.error('请先登录飞书账号');
        return;
      }
      
      message.info('正在重试下载文件...');
      await tauriApi.retryDownloadFile(taskId, fileToken, access_token);
      message.success('文件重试下载已开始');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('重试下载文件失败:', error);
      message.error('重试下载文件失败');
    }
  };

  /**
   * 重试下载任务中所有失败的文件
   */
  const handleRetryFailedFiles = async (taskId: string) => {
    try {
      const access_token = localStorage.getItem('feishu_access_token');
      if (!access_token) {
        message.error('请先登录飞书账号');
        return;
      }
      
      // 找到对应的任务
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        message.error('任务不存在');
        return;
      }
      
      // 获取所有失败的文件
      const failedFiles = task.files ? task.files.filter(file => file.status === 'failed') : [];
      if (failedFiles.length === 0) {
        message.info('没有失败的文件需要重试');
        return;
      }
      
      message.info(`正在重试 ${failedFiles.length} 个失败的文件...`);
      
      // 逐个重试失败的文件
      for (const file of failedFiles) {
        try {
          await tauriApi.retryDownloadFile(taskId, file.token, access_token);
        } catch (error) {
          console.error(`重试文件 ${file.name} 失败:`, error);
        }
      }
      
      message.success('失败文件重试下载已开始');
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('重试失败文件失败:', error);
      message.error('重试失败文件失败');
    }
  };

  // 展开行渲染函数
  const expandedRowRender = (record: DownloadTask) => {
    // 为文件数据添加taskId属性
    const filesWithTaskId = record.files ? record.files.map(file => ({ ...file, taskId: record.id })) : [];
    
    return (
      <Table
        columns={fileColumns}
        dataSource={filesWithTaskId}
        pagination={false}
        size="small"
        rowKey="token"
        style={{ margin: 0 }}
      />
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card 
        title="下载任务列表" 
        extra={
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={onGoBack}
          >
            返回首页
          </Button>
        }
      >
        <Spin spinning={loading}>
          <div style={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}>
            <Table
              columns={taskColumns}
              dataSource={tasks}
              rowKey="id"
              expandable={{
                 expandedRowRender,
                 expandedRowKeys,
                 onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
                 rowExpandable: (record) => Boolean(record.files && record.files.length > 0),
               }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 个任务`,
              }}
              locale={{
                emptyText: '暂无下载任务',
              }}
            />
          </div>
        </Spin>
      </Card>
    </Space>
  );
};

export default TaskListPage;