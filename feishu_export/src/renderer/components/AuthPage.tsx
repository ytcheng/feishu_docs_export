import React, { useEffect, useRef, useState } from 'react';
import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

const FEISHU_APP_ID = 'cli_a1ad86f33c38500d'; // TODO: 替换为你的 app_id
const FEISHU_APP_SECRET = 'iNw9h4HWv10gsyk0ZbOejhJs7YwHVQo3'; // TODO: 替换为你的 app_secret
const FEISHU_REDIRECT_URI = 'http://localhost:3001/callback'; // TODO: 替换为你的 redirect_uri

// 全局标记，防止多个组件实例同时初始化QR码
let globalQRInitialized = false;



/**
 * 飞书授权页面组件
 * 简化版本，直接在固定div中渲染QR码
 */
const AuthPage: React.FC<{ onAuth: (token: string) => void }> = ({ onAuth }) => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const qrInitializedRef = useRef<boolean>(false);
  const authCallbackRef = useRef(onAuth);
  
  // 更新回调引用
  authCallbackRef.current = onAuth;
  
  /**
   * 监听来自主进程的access_token（只初始化一次）
   */
  useEffect(() => {
    const handleAccessToken = (authData: AuthData) => {
       console.log('收到认证数据:', authData);
       
       // 保存认证数据到本地存储
       localStorage.setItem('feishu_access_token', authData.access_token);
       localStorage.setItem('feishu_refresh_token', authData.refresh_token);
       localStorage.setItem('feishu_user_info', JSON.stringify(authData.user_info));
       console.log('授权成功，已保存认证数据到localStorage');
       
       // 授权成功，隐藏二维码页面，展示主界面
       authCallbackRef.current(authData.access_token);
     };
    
    const handleAuthError = (error: any) => {
      console.error('授权失败:', error);
      alert('授权失败，请重试');
    };
    
    if (window.electronAPI) {
      window.electronAPI.onFeishuAccessToken(handleAccessToken);
      window.electronAPI.onFeishuAuthError(handleAuthError);
    }
  }, []);



  /**
   * 加载飞书QR登录脚本
   */
  useEffect(() => {
    // 检查是否已插入 script，避免多次插入
    if (!document.getElementById('feishu-qr-script')) {
      const script = document.createElement('script');
      script.id = 'feishu-qr-script';
      script.src = 'https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js';
      script.async = true;
      script.onload = () => {
        setScriptLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      setScriptLoaded(true);
    }
  }, []);

  /**
   * 初始化飞书QR登录（只执行一次）
   */
  useEffect(() => {
    if (!scriptLoaded || !qrContainerRef.current || qrInitializedRef.current || globalQRInitialized) return;

    // 双重检查，防止React严格模式导致的重复执行
    if (qrInitializedRef.current || globalQRInitialized) return;
    qrInitializedRef.current = true;
    globalQRInitialized = true;

    const containerId = 'feishu-qr-container';
    qrContainerRef.current.id = containerId;

    // @ts-ignore
    if (window.QRLogin) {
      // @ts-ignore
      const goto = `https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=${FEISHU_APP_ID}&redirect_uri=${FEISHU_REDIRECT_URI}&response_type=code&state=STATE`;
      
      // 延迟初始化，确保DOM已经准备好
      setTimeout(() => {
        // 再次检查是否已经初始化（防止多个setTimeout同时执行）
        if (!qrInitializedRef.current) return;
        
        try {
          // 清理页面中所有可能存在的飞书QR码元素
          const existingQRIframes = document.querySelectorAll('iframe[src*="feishu"], iframe[src*="lark"]');
          existingQRIframes.forEach(iframe => {
            console.log('清理已存在的飞书QR码iframe');
            iframe.remove();
          });
          
          // 清理所有可能的QR容器
          const existingContainers = document.querySelectorAll('#feishu-qr-container');
          existingContainers.forEach((container, index) => {
            if (index > 0) { // 保留第一个，清理其他的
              console.log('清理重复的QR容器');
              container.innerHTML = '';
            }
          });
          
          // 检查容器是否已经有内容（防止重复初始化）
          if (qrContainerRef.current && qrContainerRef.current.children.length > 0) {
            console.log('QR码容器已存在内容，跳过初始化');
            return;
          }
          
          // 清空容器内容
          if (qrContainerRef.current) {
            qrContainerRef.current.innerHTML = '';
          }
          
          console.log('开始初始化飞书QR码...');
          
          // @ts-ignore
          const QRLoginObj = window.QRLogin({
            id: containerId,
            goto,
            width: '300',
            height: '300',
            style: 'width:300px;height:300px;border:none;'
          });

          // 飞书文档要求的 message 监听
          const handleMessage = function (event: MessageEvent) {
            // @ts-ignore
            if (QRLoginObj && QRLoginObj.matchOrigin && QRLoginObj.matchData && 
                QRLoginObj.matchOrigin(event.origin) && QRLoginObj.matchData(event.data)) {
              // @ts-ignore
              var loginTmpCode = event.data.tmp_code;
              const authUrl = `${goto}&tmp_code=${loginTmpCode}`;
              
              // 使用BrowserWindow打开授权页面
              if (window.electronAPI) {
                window.electronAPI.openFeishuAuth(authUrl);
              } else {
                // 降级处理：如果electronAPI不可用，仍使用原来的方式
                window.location.href = authUrl;
              }
            }
          };
          
          messageHandlerRef.current = handleMessage;
          
          if (typeof window.addEventListener != 'undefined') {
            window.addEventListener('message', handleMessage, false);
          } else if (typeof (window as any).attachEvent != 'undefined') {
            (window as any).attachEvent('onmessage', handleMessage);
          }
        } catch (error) {
          console.error('初始化飞书QR登录失败:', error);
          // 如果初始化失败，重置标记以便重试
          qrInitializedRef.current = false;
          globalQRInitialized = false;
        }
      }, 100);
    }

    return () => {
      // 清理事件监听器
      if (messageHandlerRef.current) {
        if (typeof window.removeEventListener != 'undefined') {
          window.removeEventListener('message', messageHandlerRef.current, false);
        } else if (typeof (window as any).detachEvent != 'undefined') {
          (window as any).detachEvent('onmessage', messageHandlerRef.current);
        }
        messageHandlerRef.current = null;
      }
      
      // 清理QR容器内容
      if (qrContainerRef.current) {
        qrContainerRef.current.innerHTML = '';
      }
      
      // 重置初始化标记
      qrInitializedRef.current = false;
      globalQRInitialized = false;
    };
  }, [scriptLoaded]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Card style={{ width: 350, textAlign: 'center' }}>
        <Title level={4}>飞书扫码授权</Title>
        <Paragraph>请使用飞书App扫码登录授权</Paragraph>
        {/* QR码容器 */}
        <div 
          ref={qrContainerRef}
          style={{ 
            margin: '24px auto', 
            width: 300, 
            height: 300, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            border: '1px dashed #d9d9d9', 
            borderRadius: '6px'
          }}
        >
          {!scriptLoaded && <span style={{ color: '#999' }}>正在加载二维码...</span>}
        </div>
      </Card>
    </div>
  );
};

export default AuthPage;