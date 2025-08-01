import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Card, Table, Button, Tag, Typography, Spin, Tooltip, App } from 'antd';
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { DownloadFile } from '../types/database';
import { feishuApi } from '../utils/feishuApi';
import * as taskManager from '../utils/taskManager';
import { FeishuFile, FeishuWikiNode } from '../types';
import { FilesDiscoveredEvent } from '../types/event';

const { Text } = Typography;

interface FileListPageProps {
  taskId: number;
  taskName?: string;
  onGoBack?: () => void;
}

/**
 * 文件列表页面组件 - 显示指定任务的文件列表
 */
const FileListPage: React.FC<FileListPageProps> = ({ taskId, taskName, onGoBack }) => {
  const { message } = App.useApp();
  const filesRef = useRef<DownloadFile[]>([]);
  const lastScrollTop = useRef(0);
  const [version, setVersion] = useState(0); // 版本号，用于跟踪文件数据变化
  const [isLoadingBottom, setIsLoadingBottom] = useState(false); // 向下滚动加载状态
  const [isLoadingTop, setIsLoadingTop] = useState(false); // 向上滚动加载状态
  const [initialLoading, setInitialLoading] = useState(true);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null); // 待设置的滚动位置
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;
  const MAX_DISPLAY_PAGES = 2;
  const MAX_DISPLAY_COUNT = PAGE_SIZE * MAX_DISPLAY_PAGES;
  const ESTIMATED_ROW_HEIGHT = 40; // 假定的表格行高度（包括边距）
  
  // 直接使用 endIndex 控制显示数量，startIndex 根据 endIndex 计算
  // const [endIndex, setEndIndex] = useState(PAGE_SIZE);
  // const startIndex = Math.max(0, endIndex - MAX_DISPLAY_COUNT);
  const startIndexRef = useRef(0);
  const endIndexRef = useRef(PAGE_SIZE);
  
  /**
   * 基于 displayCount 和 version 自动计算显示的文件列表
   */
  const displayedFiles = useMemo(() => {
    return filesRef.current.slice(startIndexRef.current, endIndexRef.current).map((file, index) => ({
      ...file,
      taskId,
      key: `${taskId}-${file.id || index}-${file.name}`
    }));
  }, [version, taskId]);

  /**
   * 使用 useLayoutEffect 确保在 DOM 更新后设置滚动位置
   */
  useLayoutEffect(() => {
    if (pendingScrollTop !== null && containerRef.current) {
      containerRef.current.scrollTop = pendingScrollTop;
      setPendingScrollTop(null);
      console.log('设置滚动位置:', pendingScrollTop);
    }
  }, [displayedFiles, pendingScrollTop]);
  
  /**
   * 增加版本号，表示文件数据发生了变化
   */
  const incrementVersion = useCallback(() => {
    setVersion(prev => prev + 1);
  }, []);

  /**
   * 处理文件发现事件
   */
  const handleFilesDiscovered = useCallback((data: FilesDiscoveredEvent) => {
    if (data.task_id === taskId) {
      const oldLength = filesRef.current.length;
      const newFiles = data.new_files.filter(file => file.type == 'FeishuWikiNode' || file.type == 'FeishuFile');
      // 更新文件列表到ref
      filesRef.current = [...filesRef.current, ...newFiles];
      
      // 检查新增的文件是否在当前显示范围内
      const isInDisplayRange = oldLength < startIndexRef.current + MAX_DISPLAY_COUNT;  
      
      // 只有当新增文件在显示范围内时才增加版本号
      if (isInDisplayRange) {
        endIndexRef.current = Math.min(startIndexRef.current + MAX_DISPLAY_COUNT, filesRef.current.length);
        incrementVersion();
      }
    }
  }, [taskId, incrementVersion]);
  
  /**
   * 处理文件状态变化事件
   */
  const handleFileStatusChanged = useCallback((data: any) => {
    if (data.task_id === taskId) {
      // 更新文件状态到ref
      const fileIndex = filesRef.current.findIndex(f => f.id === data.file_id);
      console.log("handleFileStatusChanged fileIndex", fileIndex, "startIndex", startIndexRef.current, "endIndex", endIndexRef.current);
      if (fileIndex !== -1) {
        filesRef.current[fileIndex] = {
          ...filesRef.current[fileIndex],
          status: data.status,
          error: data.error || undefined
        };
        
        // 只有当变化的文件在当前显示范围内时才增加版本号
        if (fileIndex >= startIndexRef.current && fileIndex < endIndexRef.current) {
          incrementVersion();
        }
      }
    }
  }, [taskId, incrementVersion]);
  
  /**
   * 设置事件监听器 - 只在taskId变化时重新设置
   */
  useEffect(() => {
    let unlistenFunctions: (() => void)[] = [];
    
    // 初始化加载文件列表
    const loadFiles = async () => {
      try {
        setInitialLoading(true);
        const fileList = await taskManager.getTaskFilesByNumericId(taskId);
        filesRef.current = fileList.filter(file => file.type == 'FeishuWikiNode' || file.type == 'FeishuFile');
        // 增加版本号，表示文件数据发生了变化
        incrementVersion();
      } catch (error) {
        console.error('加载文件列表失败:', error);
      } finally {
        setInitialLoading(false);
      }
    };
    
    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // 监听文件发现事件
        const unlistenFilesDiscovered = await listen<FilesDiscoveredEvent>('files-discovered', (event: any) => {
          handleFilesDiscovered(event.payload);
        });
        
        // 监听文件状态变化事件
        const unlistenFileStatusChanged = await listen('file-status-changed', (event: any) => {
          handleFileStatusChanged(event.payload);
        });
        
        unlistenFunctions.push(unlistenFilesDiscovered, unlistenFileStatusChanged);
      } catch (error) {
        console.error('设置FileListPage事件监听器失败:', error);
      }
    };
    
    setupListeners();
    loadFiles();
    
    return () => {
      unlistenFunctions.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          console.error('清理FileListPage事件监听器失败:', error);
        }
      });
    };
  }, [taskId, incrementVersion]);
  
  /**
   * 处理滚动事件，实现懒加载并保持可视区域内容稳定
   */
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    console.log("handleScroll scrollTop", scrollTop, "scrollHeight", scrollHeight, "clientHeight", clientHeight);
    if (scrollTop > lastScrollTop.current) {
      // 向下滚动
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 10;
      
      if (isNearBottom && endIndexRef.current < filesRef.current.length && !isLoadingBottom) {
        setIsLoadingBottom(true);
        
        // 保存当前滚动位置
        const currentScrollTop = scrollTop;
        const oldEndIndex = endIndexRef.current;

        endIndexRef.current = Math.min(oldEndIndex + PAGE_SIZE, filesRef.current.length);
        startIndexRef.current = Math.max(endIndexRef.current - MAX_DISPLAY_COUNT, 0);
        incrementVersion();
        
        // 向下滚动加载新行后，滚动位置补偿
        const addedRows = Math.min(PAGE_SIZE, endIndexRef.current - oldEndIndex);
        const compensationHeight = addedRows * ESTIMATED_ROW_HEIGHT;
        console.log("handleScroll addedRows", addedRows,"向下滚动加载新行后，滚动位置补偿", compensationHeight);
        const newScrollTop = Math.max(0, currentScrollTop - compensationHeight);
        setPendingScrollTop(newScrollTop);
        setIsLoadingBottom(false);
      }
    } else {
      // 向上滚动
      const isNearTop = scrollTop < 10;
      if (isNearTop && startIndexRef.current > 0 && !isLoadingTop) {
        setIsLoadingTop(true);
        
        // 保存当前滚动位置
        const currentScrollTop = scrollTop;
        
        const oldStartIndex = startIndexRef.current;

        startIndexRef.current = Math.max(oldStartIndex - PAGE_SIZE, 0);
        endIndexRef.current = Math.min(startIndexRef.current + MAX_DISPLAY_COUNT, filesRef.current.length);
        incrementVersion();
        
        // 向上滚动减少显示行数后，滚动位置补偿
        // 计算从顶部移除的行数
        const removedFromTop = oldStartIndex - startIndexRef.current;
        
        if (removedFromTop > 0) {
          // 向上滚动时，上部减少了行数，需要向下补偿滚动位置
          const compensationHeight = removedFromTop * ESTIMATED_ROW_HEIGHT;
          const newScrollTop = Math.max(0, currentScrollTop + compensationHeight);
          setPendingScrollTop(newScrollTop);
        }
        
        setIsLoadingTop(false);
      }
    }

    lastScrollTop.current = scrollTop;
  }, [isLoadingBottom, isLoadingTop]);
  
  /**
   * 重试下载单个文件
   */
  const handleRetryFile = useCallback(async (taskId: number, fileToken: string) => {
    try {
      if (!(await feishuApi.checkToken())) {
        message.error('请先登录飞书账号');
        return;
      }

      message.info('正在重试下载文件...');
      await taskManager.retryDownloadFile(taskId.toString(), fileToken);
      message.success('文件重试下载已开始');
    } catch (error) {
      console.error('重试下载文件失败:', error);
      message.error('重试下载文件失败');
    }
  }, []);

  // 文件详情表格列定义
  const fileColumns = useMemo(() => [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: '35%',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: '10%',
      render: (type: string, record: DownloadFile) => {
        const fileType = type === 'FeishuFile' ? (record.fileInfo as FeishuFile).type : (record.fileInfo as FeishuWikiNode).obj_type;
        const typeMap: { [key: string]: string } = {
          'file': '文件',
          'doc': '文档',
          'docx': '文档',
          'sheet': '表格',
          'bitable': '多维表格',
          'folder': '文件夹'
        };
        return typeMap[fileType] || fileType;
      },
    },
    {
      title: '相对路径',
      dataIndex: 'path',
      key: 'path',
      width: '30%',
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
      width: '10%',
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
      width: '10%',
      render: (_: any, record: DownloadFile & { taskId: number }) => (
        <div>
          {record.status === 'failed' && (
            <Button
              icon={<ReloadOutlined />}
              size="small"
              type="primary"
              onClick={() => handleRetryFile(record.taskId, (record.fileInfo as any).token)}
              title="重试下载"
            >
              重试
            </Button>
          )}
        </div>
      ),
    },
  ], [handleRetryFile]);

  if (initialLoading) {
    return (
      <Card 
        title={`文件列表${taskName ? ` - ${taskName}` : ''}`}
        extra={
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={onGoBack}
          >
            返回
          </Button>
        }
      >
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" /> 加载文件列表中...
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>文件列表{taskName ? ` - ${taskName}` : ''}</span>
          <span style={{ color: '#666', fontSize: '14px', fontWeight: 'normal' }}>
            共 {filesRef.current.length} 个文件
          </span>
        </div>
      }
      extra={
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={onGoBack}
        >
          返回
        </Button>
      }
    >
      
      <div 
        ref={containerRef}
        style={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}
        onScroll={handleScroll}
      >
        {isLoadingTop && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <Spin size="small" /> 加载中...
          </div>
        )}
        <Table
          columns={fileColumns}
          dataSource={displayedFiles}
          pagination={false}
          size="small"
          rowKey={(record) => record.key || `${record.id || 0}-${record.name}`}
          style={{ margin: 0 }}
        />
        {isLoadingBottom && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <Spin size="small" /> 加载中...
          </div>
        )}
        {endIndexRef.current < filesRef.current.length && !isLoadingBottom && (
          <div style={{ textAlign: 'center', padding: '10px', color: '#999' }}>
            滑动到底部加载更多 ({endIndexRef.current}/{filesRef.current.length})
          </div>
        )}
      </div>
    </Card>
  );
};

export default FileListPage;