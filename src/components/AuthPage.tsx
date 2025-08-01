import React, { useEffect, useRef, useState } from 'react';
import { Card, Typography, App } from 'antd';
import { feishuApi } from '../utils/feishuApi';
import { openUrl} from '@tauri-apps/plugin-opener'
import { start, cancel, onUrl } from '@fabianlars/tauri-plugin-oauth';



const { Title, Paragraph } = Typography;

const FEISHU_APP_ID = 'cli_a1ad86f33c38500d';
const FEISHU_SCOPE = 'docs:doc docs:document.media:download docs:document:export docx:document drive:drive drive:file drive:file:download offline_access';
// const FEISHU_REDIRECT_URI = 'http://localhost:{}/callback';

// 全局标记，防止多个组件实例同时初始化QR码
let globalQRInitialized = false;

/**
 * 授权数据接口
 */
interface AuthData {
  access_token: string;
  refresh_token: string;
  user_info: any;
}

/**
 * 飞书授权页面组件属性
 */
interface AuthPageProps {
  onAuth: () => void;
  onGoToSettings?: () => void;
}

/**
 * 飞书授权页面组件
 * 适配Tauri版本
 */
const AuthPage: React.FC<AuthPageProps> = ({ onAuth, onGoToSettings }) => {
  const { message } = App.useApp();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const qrInitializedRef = useRef<boolean>(false);
  const authCallbackRef = useRef(onAuth);
  const port = useRef(0);
  const redirectUri = useRef('');
  const isProcessingAuth = useRef(false); // 添加授权处理标记
  // 更新回调引用
  authCallbackRef.current = onAuth;
  
  /**
   * 处理授权回调
   */
  const handleAuthCallback = async (code: string) => {
    // 防止重复处理授权
    if (isProcessingAuth.current) {
      console.log('授权正在处理中，忽略重复调用');
      return;
    }
    
    isProcessingAuth.current = true;
    
    try {
      console.log('收到授权码:', code);
      
      // 调用Tauri后端获取token
      const tokenData = await feishuApi.getAccessToken(code, redirectUri.current);
      // 获取用户信息
      const user_info = await feishuApi.getUserInfo();
      console.log("handleAuthCallback user_info", user_info);
      const authData: AuthData = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        user_info: user_info || {}
      };
      
      // 保存认证数据到本地存储
      localStorage.setItem('feishu_user_info', JSON.stringify(authData.user_info));
      
      console.log('授权成功，已保存认证数据到localStorage');
      message.success('授权成功！');
      
      // 授权成功，展示主界面
      authCallbackRef.current();
    } catch (error) {
      console.error('授权失败:', error);
      message.error(`授权失败，请重试: ${error}`);
      // 授权失败时重置标记，允许重试
      isProcessingAuth.current = false;
    }
  };


  //启动回调服务器
  useEffect(() => {
    const run = async () => {
      const oauthConfig = {
        ports: [3000, 3001],
        response: 'OAuth finished. You may close this tab.<script>setTimeout(() => { window.close(); }, 1000);</script>'
      };

      port.current = await start(oauthConfig);
      console.log('监听端口:', port.current);

      
    };
    run();

    const handleBeforeUnload = () => {
      console.log('页面即将刷新/关闭，取消监听端口:', port.current);
      if (port.current) {
        cancel(port.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleUnload = () => {
      console.log('unload 触发了');
      if (port.current) {
        cancel(port.current);
      }
    };

    window.addEventListener('unload', handleUnload);


    return () => {
      console.log('取消监听端口:', port.current);
      if (port.current) {
        cancel(port.current);
      }
      // 重置授权处理标记
      isProcessingAuth.current = false;
    }
  }, []);
  
  /**
   * 监听URL变化，检测授权回调
   */
  useEffect(() => {
    let unlistenRef: (() => void) | null = null;
    
    const checkAuthCallback = (url: string) => {
      console.log('收到url:', url);
      const urlObj = new URL(url);
      const urlParams = new URLSearchParams(urlObj.search);
      console.log('收到params:', urlParams);
      const code = urlParams.get('code');
      console.log('收到code:', code);
      if (code) {
        handleAuthCallback(code);
        cancel(port.current);
        port.current = 0;
        // 授权成功后立即清理监听器
        if (unlistenRef) {
          console.log('授权成功，取消监听url');
          unlistenRef();
          unlistenRef = null;
        }
      }
    };

    // 设置URL监听器
    const setupUrlListener = async () => {
      try {
        unlistenRef = await onUrl(checkAuthCallback);
        console.log('URL监听器已设置');
      } catch (error) {
        console.error('设置URL监听器失败:', error);
      }
    };
    
    // 延迟设置监听器，确保端口已经启动
    const timeoutId = setTimeout(setupUrlListener, 10);
    
    // 清理函数
    return () => {
      clearTimeout(timeoutId);
      if (unlistenRef) {
        console.log('组件卸载，取消监听url');
        unlistenRef();
        unlistenRef = null;
      }
    };
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
      script.onerror = () => {
        console.error('加载飞书QR登录脚本失败');
        message.error('加载登录组件失败，请检查网络连接');
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
      
      
      // 延迟初始化，确保DOM已经准备好
      setTimeout(async () => {
        // 再次检查是否已经初始化（防止多个setTimeout同时执行）
        if (!qrInitializedRef.current) return;

        redirectUri.current = `http://localhost:${port.current}/callback`;
        console.log("redirectUri", redirectUri.current);
        // @ts-ignore
        const goto = `https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=${FEISHU_APP_ID}&redirect_uri=${redirectUri.current}&response_type=code&scope=${encodeURIComponent(FEISHU_SCOPE)}&state=STATE`;
        console.log("goto", goto);
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
          const handleMessage = async function (event: MessageEvent) {
            console.log("handleMessage", event, QRLoginObj);
            // @ts-ignore
            if (QRLoginObj && QRLoginObj.matchOrigin && QRLoginObj.matchData && 
                QRLoginObj.matchOrigin(event.origin) && QRLoginObj.matchData(event.data)) {
              console.log("handleMessage matched", QRLoginObj, event);
              // @ts-ignore
              var loginTmpCode = event.data.tmp_code;
              const authUrl = `${goto}&tmp_code=${loginTmpCode}`;
              console.log("authUrl", authUrl);


              await onUrl((url) => {
                console.log('Received OAuth URL:', url);
              // Handle the OAuth redirect
              });
              openUrl(authUrl);
              // await cancel(port);
              // 在Tauri中直接跳转到授权页面
              // window.location.href = authUrl;
              // window.open(authUrl, '_blank');
              // openUrl(authUrl);
              // console.log("跳转到授权页面");
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
          message.error('初始化登录组件失败');
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
        
        {/* 设置链接 */}
        {onGoToSettings && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
            <Paragraph type="secondary" style={{ fontSize: '12px', marginBottom: '8px' }}>
              需要修改应用信息？
            </Paragraph>
            <a 
              onClick={onGoToSettings}
              style={{ cursor: 'pointer', color: '#1890ff' }}
            >
              前往设置
            </a>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AuthPage;