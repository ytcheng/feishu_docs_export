import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Typography, App } from 'antd';
import { feishuApi } from '../utils/feishuApi';
import { openUrl} from '@tauri-apps/plugin-opener'
import { start, cancel, onUrl } from '@fabianlars/tauri-plugin-oauth';
import { emit } from '@tauri-apps/api/event';
import { FeishuConfig } from '../utils/feishuConfig';
import { buildFeishuAuthorizeUrl } from '../utils/feishuAuth';
import { UserInfo } from '../types';



const { Title, Paragraph } = Typography;

const FEISHU_SCOPE = 'docs:doc docs:document.media:download docs:document:export docx:document drive:drive drive:file drive:file:download offline_access';
// const FEISHU_REDIRECT_URI = 'http://localhost:{}/callback';


/**
 * 授权数据接口
 */
interface AuthData {
  access_token: string;
  refresh_token: string;
  user_info: UserInfo;
}

interface QRLoginInstance {
  matchOrigin(origin: string): boolean;
  matchData(data: unknown): boolean;
}

interface QRLoginOptions {
  id: string;
  goto: string;
  width: string;
  height: string;
  style: string;
}

interface AuthWindow extends Window {
  QRLogin?: (options: QRLoginOptions) => QRLoginInstance;
}

/**
 * 飞书授权页面组件属性
 */
interface AuthPageProps {
  authConfig: FeishuConfig | null;
  onGoToSettings?: () => void;
}

/**
 * 飞书授权页面组件
 * 适配Tauri版本
 */
const AuthPage: React.FC<AuthPageProps> = ({ authConfig, onGoToSettings }) => {
  const { message } = App.useApp();
  const authWindow = window as AuthWindow;
  const [scriptLoaded, setScriptLoaded] = useState(false);
  useEffect(() => {
    if (!authConfig) {
      message.error('请先在设置页填写完整的飞书应用配置');
    }
  }, [authConfig, message]);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [callback, setCallback] = useState<{ config: FeishuConfig; port: number } | null>(null);
  const redirectUri = useRef('');
  const isProcessingAuth = useRef(false); // 添加授权处理标记
  
  /**
   * 处理授权回调
   */
  const handleAuthCallback = useCallback(async (code: string) => {
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
        user_info
      };
      
      // 保存认证数据到本地存储
      localStorage.setItem('feishu_user_info', JSON.stringify(authData.user_info));
      
      console.log('授权成功，已保存认证数据到localStorage');
      message.success('授权成功！');
      
      // 发送授权成功事件
      await emit('auth-success', { message: '授权成功' });
    } catch (error) {
      console.error('授权失败:', error);
      message.error(`授权失败，请重试: ${error}`);
      // 授权失败时重置标记，允许重试
      isProcessingAuth.current = false;
    }
  }, [message]);


  // Register the callback before starting the server. Each effect owns its resources,
  // including resources that finish initializing after cleanup (StrictMode/navigation).
  useEffect(() => {
    setCallback(null);
    if (!authConfig) return;

    let disposed = false;
    let serverPort = 0;
    let unlisten: (() => void) | undefined;
    const stopServer = () => {
      if (serverPort) {
        const stoppedPort = serverPort;
        serverPort = 0;
        void cancel(stoppedPort).catch(console.error);
      }
    };
    const initialize = async () => {
      try {
        const removeListener = await onUrl((url) => {
          if (disposed) return;
          const code = new URL(url).searchParams.get('code');
          if (code) {
            void handleAuthCallback(code);
            stopServer();
          }
        });
        if (disposed) {
          removeListener();
          return;
        }
        unlisten = removeListener;
        const startedPort = await start({
          ports: [3000, 3001],
          response: 'OAuth finished. You may close this tab.<script>setTimeout(() => { window.close(); }, 1000);</script>'
        });
        serverPort = startedPort;
        if (disposed) {
          stopServer();
          return;
        }
        redirectUri.current = `http://localhost:${startedPort}/callback`;
        setCallback({ config: authConfig, port: startedPort });
      } catch (error) {
        unlisten?.();
        unlisten = undefined;
        if (!disposed) {
          console.error('初始化授权回调失败:', error);
          message.error('初始化授权回调失败，请重试');
        }
      }
    };
    void initialize();
    window.addEventListener('beforeunload', stopServer);
    window.addEventListener('unload', stopServer);
    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', stopServer);
      window.removeEventListener('unload', stopServer);
      unlisten?.();
      stopServer();
      isProcessingAuth.current = false;
    };
  }, [authConfig, handleAuthCallback, message]);

  /** Load the shared SDK, but wait for its actual load event on remount. */
  useEffect(() => {
    if (!authConfig) return;
    if (authWindow.QRLogin) {
      setScriptLoaded(true);
      return;
    }
    setScriptLoaded(false);
    let script = document.getElementById('feishu-qr-script') as HTMLScriptElement | null;
    const isNew = !script;
    if (!script) {
      script = document.createElement('script');
      script.id = 'feishu-qr-script';
      script.src = 'https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js';
      script.async = true;
    }
    const onLoad = () => setScriptLoaded(true);
    const onError = () => {
      script.remove();
      message.error('加载登录组件失败，请检查网络连接');
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (isNew) document.body.appendChild(script);
    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      // A script that fails while no page is listening cannot be reused.
      if (!authWindow.QRLogin) script.remove();
    };
  }, [authConfig, authWindow, message]);

  /** Only render a QR code after both the SDK and callback server are ready. */
  useEffect(() => {
    const container = qrContainerRef.current;
    const qrLogin = authWindow.QRLogin;
    if (!authConfig || !scriptLoaded || callback?.config !== authConfig || !container || !qrLogin) return;

    container.id = 'feishu-qr-container';
    container.innerHTML = '';
    const goto = buildFeishuAuthorizeUrl({
      appId: authConfig.appId,
      redirectUri: `http://localhost:${callback.port}/callback`,
      scope: FEISHU_SCOPE,
    });
    try {
      const qr = qrLogin({
        id: container.id,
        goto,
        width: '300',
        height: '300',
        style: 'width:300px;height:300px;border:none;'
      });
      const handleMessage = (event: MessageEvent) => {
        if (qr.matchOrigin(event.origin) && qr.matchData(event.data)) {
          const loginTmpCode = (event.data as { tmp_code?: string }).tmp_code;
          void openUrl(`${goto}&tmp_code=${encodeURIComponent(loginTmpCode ?? '')}`);
        }
      };
      window.addEventListener('message', handleMessage);
      return () => {
        window.removeEventListener('message', handleMessage);
        container.innerHTML = '';
      };
    } catch (error) {
      console.error('初始化飞书QR登录失败:', error);
      message.error('初始化登录组件失败');
    }
  }, [authConfig, authWindow, callback, message, scriptLoaded]);

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
          {!authConfig && <span style={{ color: '#999' }}>请先完成飞书应用配置</span>}
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
