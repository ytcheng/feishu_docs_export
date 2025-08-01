import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Space, App, Divider, Collapse } from 'antd';
import { SettingOutlined, SaveOutlined, ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { FeishuConfig } from '../utils/feishuApi';

const { Title, Paragraph } = Typography;

// 自定义输入框样式
const inputStyle = {
  boxShadow: 'none !important',
  border: '1px solid #d9d9d9',
  borderRadius: '6px',
  transition: 'border-color 0.3s ease'
};

/**
 * 设置页面组件属性
 */
interface SettingsPageProps {
  onBack?: () => void;
  onConfigSaved?: (config: FeishuConfig) => void;
}

/**
 * 飞书设置页面组件
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, onConfigSaved }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  /**
   * 从 localStorage 加载配置
   */
  const loadConfig = (): FeishuConfig => {
    try {
      const configStr = localStorage.getItem('feishu_config');
      if (configStr) {
        return JSON.parse(configStr);
      }
    } catch (error) {
      console.error('加载飞书配置失败:', error);
    }
    
    // 返回默认配置
    return {
      appId: '',
      appSecret: '',
      endpoint: 'https://open.feishu.cn/open-apis'
    };
  };

  /**
   * 保存配置到 localStorage
   */
  const saveConfig = (config: FeishuConfig): void => {
    try {
      localStorage.setItem('feishu_config', JSON.stringify(config));
    } catch (error) {
      console.error('保存飞书配置失败:', error);
      throw error;
    }
  };

  /**
   * 处理表单提交
   */
  const handleSubmit = async (values: FeishuConfig) => {
    setLoading(true);
    try {
      // 验证必填字段
      if (!values.appId || !values.appSecret || !values.endpoint) {
        message.error('请填写完整的配置信息');
        return;
      }

      // 保存配置
      saveConfig(values);
      message.success('配置保存成功！');
      
      // 通知父组件配置已保存
      if (onConfigSaved) {
        onConfigSaved(values);
      }
      
      // 如果有返回回调，延迟执行
      if (onBack) {
        setTimeout(() => {
          onBack();
        }, 1000);
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      message.error('保存配置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重置为默认配置
   */
  const handleReset = () => {
    const defaultConfig = {
      appId: '',
      appSecret: '',
      endpoint: 'https://open.feishu.cn/open-apis'
    };
    form.setFieldsValue(defaultConfig);
  };

  // 组件挂载时加载配置
  useEffect(() => {
    const config = loadConfig();
    form.setFieldsValue(config);
  }, [form]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '40px 20px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <Card style={{ width: 500, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <SettingOutlined style={{ fontSize: '32px', color: '#1890ff', marginBottom: '16px' }} />
          <Title level={3}>飞书应用配置</Title>
          <Paragraph type="secondary">
            请配置您的飞书应用信息，这些信息将用于连接飞书API
          </Paragraph>
          
          <Collapse 
            size="small"
            style={{ marginTop: '16px', textAlign: 'left' }}
            items={[
              {
                key: 'setup-guide',
                label: (
                  <span style={{ color: '#1890ff', fontSize: '13px' }}>
                    <InfoCircleOutlined style={{ marginRight: '6px' }} />
                    配置指南（点击查看详细说明）
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ 
                      background: '#f6ffed', 
                      border: '1px solid #b7eb8f', 
                      borderRadius: '6px', 
                      padding: '12px', 
                      marginBottom: '12px'
                    }}>
                      <Paragraph style={{ margin: 0, fontSize: '13px', color: '#52c41a' }}>
                        <strong>重定向URL配置：</strong>请确保在飞书应用设置中添加以下重定向URL：
                      </Paragraph>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px', color: '#389e0d' }}>
                        <li><code>http://localhost:3000</code></li>
                        <li><code>http://localhost:3001</code></li>
                      </ul>
                      <Paragraph style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#389e0d' }}>
                        路径：飞书开放平台 → 应用管理 → 您的应用 → 安全设置 → 重定向URL
                      </Paragraph>
                    </div>
                    
                    <div style={{ 
                       background: '#fff7e6', 
                       border: '1px solid #ffd591', 
                       borderRadius: '6px', 
                       padding: '12px'
                     }}>
                       <Paragraph style={{ margin: 0, fontSize: '13px', color: '#d48806' }}>
                         <strong>权限配置：</strong>请确保为应用开通以下权限范围（Scope）：
                       </Paragraph>
                       <div style={{ margin: '8px 0', padding: '8px', background: '#fef9e7', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', color: '#8b5a00' }}>
                         docs:doc docs:document.media:download docs:document:export docx:document drive:drive drive:file drive:file:download offline_access
                       </div>
                       <Paragraph style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#d46b08' }}>
                         <strong>具体权限说明：</strong>
                       </Paragraph>
                       <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '11px', color: '#d46b08' }}>
                         <li><code>docs:doc</code> - 查看、评论、编辑和管理云文档</li>
                         <li><code>docs:document.media:download</code> - 下载云文档中的媒体文件</li>
                         <li><code>docs:document:export</code> - 导出云文档为指定格式</li>
                         <li><code>docx:document</code> - 访问新版文档</li>
                         <li><code>drive:drive</code> - 获取云空间信息</li>
                         <li><code>drive:file</code> - 访问云空间文件</li>
                         <li><code>drive:file:download</code> - 下载云空间文件</li>
                         <li><code>offline_access</code> - 离线访问授权数据</li>
                       </ul>
                       <Paragraph style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#d46b08' }}>
                         路径：飞书开放平台 → 应用管理 → 您的应用 → 权限管理 → 权限配置
                       </Paragraph>
                     </div>
                  </div>
                )
              }
            ]}
          />
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="应用ID (App ID)"
            name="appId"
            rules={[
              { required: true, message: '请输入应用ID' },
              { min: 10, message: '应用ID长度不能少于10位' }
            ]}
          >
            <Input 
              placeholder="请输入飞书应用的App ID"
              size="large"
              style={inputStyle}
              className="custom-input"
            />
          </Form.Item>

          <Form.Item
            label="应用密钥 (App Secret)"
            name="appSecret"
            rules={[
              { required: true, message: '请输入应用密钥' },
              { min: 10, message: '应用密钥长度不能少于10位' }
            ]}
          >
            <Input.Password 
              placeholder="请输入飞书应用的App Secret"
              size="large"
              style={inputStyle}
              className="custom-input"
            />
          </Form.Item>

          <Form.Item
            label="API端点 (Endpoint)"
            name="endpoint"
            rules={[
              { required: true, message: '请输入API端点' },
              { type: 'url', message: '请输入有效的URL地址' }
            ]}
          >
            <Input 
              placeholder="https://open.feishu.cn/open-apis"
              size="large"
              style={inputStyle}
              className="custom-input"
            />
          </Form.Item>

          <Divider />

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                {onBack && (
                  <Button 
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                  >
                    返回
                  </Button>
                )}
                <Button onClick={handleReset}>
                  重置
                </Button>
              </Space>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                icon={<SaveOutlined />}
                size="large"
              >
                保存配置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <Divider />
        
        <div style={{ textAlign: 'center' }}>
          <Paragraph type="secondary" style={{ fontSize: '12px' }}>
            配置信息将保存在本地，不会上传到服务器
          </Paragraph>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;