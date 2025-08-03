import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, Table, Progress, Space, Button, Tag, Popconfirm, Typography, Spin, App } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined, PlayCircleOutlined, ArrowLeftOutlined, StopOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DownloadTask, TaskStatus } from '../types/database';
import { openPath } from '@tauri-apps/plugin-opener'
import { feishuApi } from '../utils/feishuApi';
import * as taskManager from '../utils/taskManager';
import FileListPage from './FileListPage';
const { Text } = Typography;



interface TaskListPageProps {
  onGoBack?: () => void;
}

/**
 * 下载任务列表页面组件
 */
const TaskListPage: React.FC<TaskListPageProps> = ({ onGoBack }) => {
  const { message } = App.useApp();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(false);
  const taskScrollRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<DownloadTask[]>([]);
  
  // 页面状态管理
  const [currentPage, setCurrentPage] = useState<'taskList' | 'fileList'>('taskList');
  const [selectedTask, setSelectedTask] = useState<{ id: number; name?: string } | null>(null);
  
  /**
   * 跳转到文件列表页面
   */
  const handleGoToFileList = useCallback((taskId: number, taskName?: string) => {
    setSelectedTask({ id: taskId, name: taskName });
    setCurrentPage('fileList');
  }, []);
  
  /**
   * 从文件列表页面返回任务列表
   */
  const handleBackToTaskList = useCallback(() => {
    setCurrentPage('taskList');
    setSelectedTask(null);
  }, []);

  /**
   * 加载下载任务列表（保持滚动位置）
   */
  const loadTasks = async () => {
    // 保存当前滚动位置
    const currentScrollTop = taskScrollRef.current?.scrollTop || 0;
    
    setLoading(true);
    try {
      const taskList = await taskManager.getDownloadTasks();
      console.log("loadTasks", taskList);
      setTasks(taskList);
      tasksRef.current = taskList;
      
      // 恢复滚动位置
      setTimeout(() => {
        if (taskScrollRef.current) {
          taskScrollRef.current.scrollTop = currentScrollTop;
        }
      }, 50);
    } catch (error) {
      console.error('获取下载任务列表失败:', error);
      message.error('获取下载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 静默更新任务列表（不显示loading，保持滚动位置）
   */
  const updateTasksSilently = async () => {
    // 保存当前滚动位置
    const currentScrollTop = taskScrollRef.current?.scrollTop || 0;
    
    try {
      const taskList = await taskManager.getDownloadTasks();
      console.log("updateTasksSilently", taskList);
      
      // 比较任务状态是否真正发生变化，避免不必要的重新渲染
      const hasChanges = JSON.stringify(tasksRef.current) !== JSON.stringify(taskList);
      if (hasChanges) {
        setTasks(taskList);
        tasksRef.current = taskList;
        
        // 恢复滚动位置
        setTimeout(() => {
          if (taskScrollRef.current) {
            taskScrollRef.current.scrollTop = currentScrollTop;
          }
        }, 10);
      }
    } catch (error) {
      console.error('静默更新任务列表失败:', error);
    }
  };

  /**
   * 删除下载任务
   * 后端会自动处理正在运行的任务停止逻辑
   */
  const handleDeleteTask = async (taskId: number) => {
    try {
      console.log("handleDeleteTask", taskId);
      await taskManager.deleteDownloadTask(taskId);
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
      await openPath(outputPath);
    } catch (error) {
      console.error('打开目录失败:', error);
      message.error('打开目录失败');
    }
  };

  /**
   * 开始下载任务（根据任务状态调用不同的API）
   */
  const handleStartDownload = async (taskId: number) => {
    try {
      if (!(await feishuApi.checkToken())) {
        message.error('请先登录飞书账号');
        return;
      }
      
      
      // 使用taskManager执行下载任务
      message.info('任务开始下载，请稍候...');
      taskManager.executeDownloadTask(taskId);
      message.success('任务开始下载');

      const tasklist = tasksRef.current.map((item) => {
        if (item.id === taskId) {
          return {
            ...item,
            status: TaskStatus.DOWNLOADING,
          }
        }
        return item;
      });
      setTasks(tasklist);
      tasksRef.current = tasklist;
      // loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('开始下载失败:', error);
      message.error('开始下载失败');
    }
  };

  /**
   * 停止下载任务
   */
  const handleStopDownload = async (taskId: number) => {
    try {
      message.info('正在停止下载任务...');
      await taskManager.stopDownloadTask(taskId);
      message.success('下载任务已停止');
      loadTasks(); // 重新加载任务列表
    } catch (error: any) {
      console.error('停止下载失败:', error);
      message.error('停止下载失败');
    }
  };

  // 防抖更新任务列表
  const debouncedUpdateTasks = useCallback(
    (() => {
      console.log("debouncedUpdateTasks");
      let timeoutId: number;
      return () => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          updateTasksSilently();
        }, 500);
      };
    })(),
    []
  );
  
  // 监听下载进度更新
  const handleDownloadProgress = useCallback((data: any) => {
    console.log('下载进度更新:', data);
    
    // 显示当前下载文件信息（如果有）
    if (data.current_file && data.current_file.trim()) {
      console.log(`正在下载: ${data.current_file} (${data.completed_files}/${data.total_files})`);
    }
    
    // 防抖更新任务列表以更新进度
    debouncedUpdateTasks();
  }, [debouncedUpdateTasks]);
  
  // 监听下载完成
  const handleDownloadComplete = useCallback((data: any) => {
    console.log('下载完成:', data);
    message.success(`任务下载完成！已完成 ${data.completed_files}/${data.total_files} 个文件`);
    updateTasksSilently(); // 立即更新任务列表
  }, []);
  
  // 监听下载错误
  const handleDownloadError = useCallback((data: any) => {
    console.log('下载错误:', data);
    const errorMsg = data.error || '未知错误';
    message.error(`任务下载失败: ${errorMsg}`);
    updateTasksSilently(); // 立即更新任务列表
  }, []);
  
  // 监听文件下载错误
  const handleDownloadFileError = useCallback((data: any) => {
    console.log('文件下载错误:', data);
    const fileName = data.fileName || data.file_name || '未知文件';
    const error = data.error || data.message || '未知错误';
    message.warning(`文件下载失败: ${fileName} - ${error}`);
    debouncedUpdateTasks(); // 防抖更新任务列表
  }, [debouncedUpdateTasks]);

  // 监听自动恢复单个任务
  const handleAutoResumeTask = useCallback(async (data: any) => {
    console.log('自动恢复下载任务:', data);
    try {
      if (await feishuApi.checkToken()) {
        message.info(`正在恢复下载任务: ${data.taskName}`);
        taskManager.executeDownloadTask(data.taskId.toString())
          .then(() => {
            updateTasksSilently(); // 静默更新任务列表
          })
          .catch((error) => {
            console.error('自动恢复下载任务失败:', error);
          });
      }
    } catch (error) {
      console.error('自动恢复下载任务失败:', error);
    }
  }, []);

  /**
   * 组件挂载时加载数据
   */
  useEffect(() => {
    console.log("TaskListPage useEffect");
    loadTasks();
    
    let unlistenFunctions: (() => void)[] = [];
    
    // 监听恢复下载任务通知
    // const handleResumeDownloadTasks = (data: any) => {
    //   console.log('发现未完成的下载任务:', data);
    //   if (data.count > 0) {
    //     message.info(`发现 ${data.count} 个未完成的下载任务，正在自动恢复...`);
    //     // 自动调用恢复下载任务
    //     handleAutoResumeDownloadTasks();
    //   }
    // };
    

    
    // 注册事件监听器
    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // 监听下载进度事件
        const unlistenProgress = await listen('download-progress', (event: any) => {
          const data = event.payload;
          console.log('收到下载进度事件:', data);
          
          // 根据事件状态处理不同逻辑
          if (data.status === 'downloading') {
            handleDownloadProgress(data);
          } else if (data.status === 'completed') {
            handleDownloadComplete(data);
          } else if (data.status === 'failed') {
            handleDownloadError(data);
          }
        });
        
        // 监听任务状态变化事件
        const unlistenTaskStatus = await listen('task-status-changed', (event: any) => {
          const data = event.payload;
          console.log('收到任务状态变化事件:', data);
          updateTasksSilently();
        });
        
        // 监听文件下载错误事件
        const unlistenFileError = await listen('file-download-error', (event: any) => {
          const data = event.payload;
          console.log('收到文件下载错误事件:', data);
          handleDownloadFileError(data);
        });
        
        // 监听任务完成事件
        const unlistenTaskComplete = await listen('task-completed', (event: any) => {
          const data = event.payload;
          console.log('收到任务完成事件:', data);
          message.success(`任务 "${data.taskName}" 已完成！`);
          updateTasksSilently();
        });
        
        // 监听任务失败事件
        const unlistenTaskFailed = await listen('task-failed', (event: any) => {
          const data = event.payload;
          console.log('收到任务失败事件:', data);
          message.error(`任务 "${data.taskName}" 下载失败: ${data.error || '未知错误'}`);
          updateTasksSilently();
        });
        
        unlistenFunctions.push(
          unlistenProgress,
          unlistenTaskStatus,
          unlistenFileError,
          unlistenTaskComplete,
          unlistenTaskFailed
        );
        
        console.log('事件监听器设置完成');
      } catch (error) {
        console.error('设置事件监听器失败:', error);
      }
    };
    
    setupListeners();
    
    // 设置定时器定期更新任务状态（仅在有下载任务时）
    const interval = setInterval(() => {
      console.log("setInterval");
      // 只有在有正在下载的任务时才更新，避免不必要的滚动位置重置
      if (tasksRef.current.some(task => task.status === 'downloading')) {
        updateTasksSilently();
      }
    }, 10000); // 改为每10秒更新一次，减少频率
    
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
  }, [handleDownloadProgress, handleDownloadComplete, handleDownloadError, handleDownloadFileError, handleAutoResumeTask]);

  // 任务表格列定义 - 使用useMemo避免每次重新创建
  const taskColumns = useMemo(() => [
     {
       title: '任务名称',
       key: 'name',
       width: '15%',
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
       width: '20%',
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
           pending: { color: 'default', text: '准备中' },
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
        width: '14%',
       render: (_: any, record: DownloadTask) => (
         <Space wrap>
            {record.status === 'downloading' && (
              <Button
                icon={<StopOutlined />}
                size="small"
                type="default"
                onClick={() => record.id && handleStopDownload(record.id)}
                title="停止下载"
              ></Button>
            )}
            {record.status === 'paused' && (
              <Button
                icon={<PlayCircleOutlined />}
                size="small"
                type="primary"
                onClick={() => record.id && handleStartDownload(record.id)}
                title="恢复下载"
              ></Button>
            )}
            {(record.status === 'completed' || record.status === 'failed') && hasFailedFiles(record) && (
              <Button
                icon={<ReloadOutlined />}
                size="small"
                type="default"
                onClick={() => record.id && handleRetryFailedFiles(record.id)}
                title="重新下载失败的文件"
              ></Button>
            )}
           <Button
             icon={<UnorderedListOutlined />}
             size="small"
             onClick={() => record.id && handleGoToFileList(record.id, new Date(record.createdAt).toLocaleString('zh-CN'))}
             title="查看文件列表"
           />
           <Button
             icon={<FolderOpenOutlined />}
             size="small"
             onClick={() => handleOpenSaveDir(record.outputPath)}
             title="打开保存目录"
           />
           <Popconfirm
             title="确定要删除这个任务吗？"
             onConfirm={() => record.id && handleDeleteTask(record.id)}
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
  ], []);

  

  /**
   * 检查任务是否有失败的文件
   */
  const hasFailedFiles = (task: DownloadTask): boolean => {
    return task.files ? task.files.some(file => file.status === 'failed') : false;
  };


  /**
   * 重试下载任务中所有失败的文件
   */
  const handleRetryFailedFiles = async (taskId: number) => {
    try {
      if (!(await feishuApi.checkToken())) {
        message.error('请先登录飞书账号');
        return;
      }

      // 找到对应的任务
      console.log("handleRetryFailedFiles taskId", taskId, "tasks", tasksRef.current);
      const task = tasksRef.current.find(t => t.id === taskId);
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
      
      message.info(`正在重置 ${failedFiles.length} 个失败文件状态并重新启动任务...`);
      
      // 将所有失败文件状态重置为待下载
      await taskManager.resetFailedFilesToPending(taskId);

      message.success('失败文件已重置，任务重新启动');
      
      // 重新启动下载任务
      await taskManager.executeDownloadTask(taskId);
      
      loadTasks(); // 重新加载任务列表
    } catch (error) {
      console.error('重试失败文件失败:', error);
      message.error('重试失败文件失败');
    }
  };




  


  // 任务列表懒加载状态
  const [taskDisplayCount, setTaskDisplayCount] = useState(10);
  const [taskIsLoading, setTaskIsLoading] = useState(false);
  
  // 当前显示的任务列表
  const displayedTasks = useMemo(() => {
    return tasks.slice(0, taskDisplayCount);
  }, [tasks, taskDisplayCount]);
  
  /**
   * 处理任务列表滚动事件，实现懒加载
   */
  const handleTaskScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 10;
    
    if (isNearBottom && taskDisplayCount < tasks.length && !taskIsLoading) {
      setTaskIsLoading(true);
      // 模拟加载延迟
      setTimeout(() => {
        setTaskDisplayCount(prev => Math.min(prev + 10, tasks.length));
        setTaskIsLoading(false);
      }, 100);
    }
  }, [taskDisplayCount, tasks.length, taskIsLoading]);
  
  /**
   * 懒加载任务列表组件
   */
  const LazyTaskList: React.FC = () => {
    return (
      <div 
        ref={taskScrollRef}
        style={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}
        onScroll={handleTaskScroll}
      >
        <Table
          columns={taskColumns}
          dataSource={displayedTasks}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: '暂无下载任务',
          }}
        />
        {taskIsLoading && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <Spin size="small" /> 加载中...
          </div>
        )}
        {taskDisplayCount < tasks.length && !taskIsLoading && (
          <div style={{ textAlign: 'center', padding: '10px', color: '#999' }}>
            滑动到底部加载更多 ({taskDisplayCount}/{tasks.length})
          </div>
        )}
      </div>
    );
  };

  // 根据当前页面状态渲染不同的组件
  if (currentPage === 'fileList' && selectedTask) {
    return (
      <FileListPage
        taskId={selectedTask.id}
        taskName={selectedTask.name}
        onGoBack={handleBackToTaskList}
      />
    );
  }

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
          <LazyTaskList />
        </Spin>
      </Card>
    </Space>
  );
};

export default TaskListPage;