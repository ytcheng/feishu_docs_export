import React from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space } from 'antd';
import { FileAddOutlined, UnorderedListOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { UserInfo } from '../types';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

interface MainLayoutProps {
  children: React.ReactNode;
  onMenuChange: (key: string) => void;
  selectedMenu: string;
  userInfo: UserInfo | null;
  onLogout: () => void;
}

/**
 * 主布局组件
 * 包含侧边栏导航、顶部用户信息和主内容区域
 */
const MainLayout: React.FC<MainLayoutProps> = ({ children, onMenuChange, selectedMenu, userInfo, onLogout }) => {
  /**
   * 用户菜单项
   */
  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout,
    },
  ];

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider width={180} style={{ background: '#fff', borderRight: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ height: 48, textAlign: 'center', lineHeight: '48px', fontWeight: 'bold', fontSize: 16 }}>飞书文档导出助手</div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenu]}
          onClick={({ key }) => onMenuChange(key as string)}
          style={{ borderRight: 0, height: 'calc(100vh - 48px)', overflow: 'auto' }}
          items={[
            { key: 'new', icon: <FileAddOutlined />, label: '新建下载任务' },
            { key: 'list', icon: <UnorderedListOutlined />, label: '下载任务列表' },
          ]}
        />
      </Sider>
      <Layout style={{ overflow: 'hidden' }}>
        <Header style={{ 
          background: '#fff', 
          borderBottom: '1px solid #eee', 
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          height: 64,
          flexShrink: 0
        }}>
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
        <Content style={{ 
          margin: 0, 
          height: 'calc(100vh - 64px)', 
          overflow: 'hidden',
          padding: 0
        }}>
          <div className="content-scroll" style={{ 
             padding: 24, 
             height: '100%', 
             overflow: 'auto'
           }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;