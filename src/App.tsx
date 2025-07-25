import React, { useState, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Typography, Space } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import AuthPage from './components/AuthPage';
import NewTaskPage from './components/NewTaskPage';
import TaskListPage from './components/TaskListPage';
import ErrorBoundary from './components/ErrorBoundary';
import { UserInfo } from './types';
import { tauriApi } from './utils/tauriApi';
import './App.css';

const { Header, Content } = Layout;
const { Text } = Typography;

const App: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [currentPage, setCurrentPage] = useState<'new' | 'list'>('list');

  /**
   * 处理授权成功回调
   * @param token - 获取到的access_token
   */
  const handleAuth = (token: string) => {
    setAccessToken(token);
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
  };

  /**
   * 处理退出登录
   */
  const handleLogout = () => {
    localStorage.removeItem('feishu_access_token');
    localStorage.removeItem('feishu_refresh_token');
    localStorage.removeItem('feishu_user_info');
    setAccessToken(null);
    setUserInfo(null);
    setAuthed(false);
    console.log('已退出登录');
  };



  useEffect(() => {
    const token = localStorage.getItem('feishu_access_token');
    if (token) {
      setAccessToken(token);
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
      
      console.log('应用已切换到主界面，token已从localStorage加载');
    }
    
    // 监听token过期事件
    const handleTokenExpired = () => {
      console.log('Token已过期，清除登录状态');
      handleLogout();
    };
    
    // 设置token过期监听器
    tauriApi.onTokenExpired(handleTokenExpired);
    
    // 清理监听器
    return () => {
      tauriApi.removeTokenExpiredListener();
    };
  }, []);

  if (!authed) {
    return (
      <ErrorBoundary>
        <AuthPage onAuth={handleAuth} />
      </ErrorBoundary>
    );
  }

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
    <Layout style={{ height: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        borderBottom: '1px solid #eee', 
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: 18 }}>飞书文档导出助手</div>
        {userInfo && (
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
        )}
      </Header>
      <Content style={{ margin: 24, height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
        {currentPage === 'new' && <NewTaskPage onTaskCreated={() => {
          console.log('app.tsx onTaskCreated');
          setCurrentPage('list');
        }} />}
        {currentPage === 'list' && <TaskListPage onNewTask={() => setCurrentPage('new')} />}
      </Content>
    </Layout>
  );
};

export default App;
