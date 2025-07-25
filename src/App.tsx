import React, { useState, useEffect } from 'react';
import AuthPage from './components/AuthPage';
import NewTaskPage from './components/NewTaskPage';
import TaskListPage from './components/TaskListPage';
import ErrorBoundary from './components/ErrorBoundary';
import MainLayout from './components/MainLayout';
import { UserInfo } from './types';
import { tauriApi } from './utils/tauriApi';

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

  /**
   * 处理菜单切换
   */
  const handleMenuChange = (key: string) => {
    setCurrentPage(key as 'new' | 'list');
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

  return (
    <ErrorBoundary>
      <MainLayout
        selectedMenu={currentPage}
        onMenuChange={handleMenuChange}
        userInfo={userInfo}
        onLogout={handleLogout}
      >
        {currentPage === 'new' && <NewTaskPage onTaskCreated={() => setCurrentPage('list')} />}
        {currentPage === 'list' && <TaskListPage onNewTask={() => setCurrentPage('new')} />}
      </MainLayout>
    </ErrorBoundary>
  );
};

export default App;
