import React, { useState, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Typography, Space, ConfigProvider, App as AntdApp } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import AuthPage from './components/AuthPage';
import HomePage from './components/HomePage';
import TaskListPage from './components/TaskListPage';
import SettingsPage from './components/SettingsPage';
import { UserInfo } from './types';
import { TokenExpiredEvent, AuthSuccessEvent } from './types/event';
import './App.css';
import { feishuApi, FeishuApi, FeishuConfig } from './utils/feishuApi';
import { activeDownloadsManager, resumeDownloadingTasks } from './utils/taskManager';


const { Header, Content } = Layout;
const { Text } = Typography;

const App: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [currentPage, setCurrentPage] = useState<'home' | 'list' | 'settings' | 'auth'>('home');
  const [hasValidConfig, setHasValidConfig] = useState(false);

  /**
   * 处理授权成功回调
   * @param token - 获取到的access_token
   */
  const handleAuth = async () => {
    // setAccessToken(token);
    setAuthed(true);
    
    // 加载用户信息
    const userInfoStr = localStorage.getItem('feishu_user_info');
    if (userInfoStr) {
      try {
        const userInfoData = JSON.parse(userInfoStr);
        setUserInfo(userInfoData);
      } catch (error) {
        console.error('解析用户信息失败:', error);
      }
    }
    
    console.log('应用已切换到主界面，token已保存到状态中');
    
    // 恢复下载中状态的任务
    try {
      const result = await resumeDownloadingTasks();
      console.log('登录后恢复下载任务完成:', result);
    } catch (error) {
      console.error('登录后恢复下载任务失败:', error);
    }
   };

  /**
   * 处理退出登录
   */
  const handleLogout = () => {
    localStorage.removeItem('feishu_user_info');
    localStorage.removeItem('feishu_token');
    setUserInfo(null);
    setAuthed(false);
    activeDownloadsManager.stopAll();
    console.log('已退出登录');
  };



  /**
   * 处理配置保存
   */
  const handleConfigSaved = (config: FeishuConfig) => {
    // 重新设置 feishuApi 实例
    FeishuApi.resetInstance(config);
    setHasValidConfig(true);
    setCurrentPage('auth');
  };

  useEffect(() => {
    const initializeApp = async () => {
      // 检查是否有有效配置
      const configValid = FeishuApi.hasValidConfig();
      setHasValidConfig(configValid);
      
      if (!configValid) {
        // 没有有效配置，跳转到设置页面
        setCurrentPage('settings');
        return;
      }
      
      // 有配置，检查token
      if (await feishuApi.checkToken()) {
        setAuthed(true);
        setCurrentPage('home');
        
        // 加载用户信息
        const userInfoStr = localStorage.getItem('feishu_user_info');

        if (userInfoStr) {
          try {
            const userInfoData = JSON.parse(userInfoStr);
            setUserInfo(userInfoData);
          } catch (error) {
            console.error('解析用户信息失败:', error);
          }
        }
        
        console.log('应用已切换到主界面，token已从localStorage加载');
        
        // 恢复下载中状态的任务
        try {
          const result = await resumeDownloadingTasks();
          console.log('应用启动时恢复下载任务完成:', result);
        } catch (error) {
          console.error('应用启动时恢复下载任务失败:', error);
        }
      } else {
        // 有配置但没有有效token，跳转到登录页面
        setCurrentPage('auth');
      }
    };
    
    initializeApp();
    
    // 设置定期检查下载任务的定时器（每30秒检查一次）
    const checkInterval = setInterval(async () => {
      if (authed) {
        try {
          const result = await resumeDownloadingTasks();
          if (result !== '没有需要恢复的任务' && result !== '所有任务都已在运行') {
            console.log('定期检查恢复下载任务:', result);
          }
        } catch (error) {
          console.error('定期检查恢复下载任务失败:', error);
        }
      }
    }, 30000); // 30秒检查一次
    
    // 监听token过期事件
    const handleTokenExpired = (event: TokenExpiredEvent) => {
      console.log('Token已过期，清除登录状态:', event.message);
      handleLogout();
      setCurrentPage('auth');
    };
    
    // 监听授权成功事件
    const handleAuthSuccess = () => {
      console.log('收到授权成功事件');
      handleAuth();
    };
    
    // 设置token过期监听器
    const unlistenTokenExpired = listen<TokenExpiredEvent>('token-expired', (event) => {
      handleTokenExpired(event.payload);
    });
    
    // 设置授权成功监听器
    const unlistenAuthSuccess = listen<AuthSuccessEvent>('auth-success', (event) => {
      console.log('收到授权成功事件:', event.payload.message);
      handleAuthSuccess();
    });
    
    // 清理监听器和定时器
    return () => {
      clearInterval(checkInterval);
      unlistenTokenExpired.then(unlisten => unlisten());
      unlistenAuthSuccess.then(unlisten => unlisten());
    };
  }, [authed]);

  /**
   * 用户菜单项
   */
  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <ConfigProvider>
      <AntdApp>
        <Layout style={{ height: '100vh' }}>
          <Header data-tauri-drag-region style={{ 
            background: '#fff', 
            borderBottom: '1px solid #eee', 
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
          }}>
            {userInfo && (
              <div style={{ position: 'absolute', right: '24px' }}>
                <Dropdown
                  menu={{ items: userMenuItems }}
                  placement="bottomRight"
                  trigger={['hover']}
                >
                  <Space style={{ cursor: 'pointer' }}>
                    <Avatar 
                      src={userInfo.avatar_thumb || userInfo.avatar_url} 
                      icon={<UserOutlined />}
                      size={32}
                    />
                    <Text>{userInfo.name}</Text>
                  </Space>
                </Dropdown>
              </div>
            )}
          </Header>
          <Content style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
            {currentPage === 'settings' && <SettingsPage onConfigSaved={handleConfigSaved} onBack={hasValidConfig ? () => setCurrentPage('auth') : undefined} />}
            {(currentPage === 'auth' || !authed) && <AuthPage onGoToSettings={() => setCurrentPage('settings')} />}
            {currentPage === 'home' && authed && <HomePage onViewTasks={() => setCurrentPage('list')} />}
            {currentPage === 'list' && authed && <TaskListPage onGoBack={() => setCurrentPage('home')} />}
          </Content>
        </Layout>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
