import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Card } from 'antd';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * React错误边界组件
 * 用于捕获子组件中的JavaScript错误，记录错误并显示备用UI
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新state使下一次渲染能够显示降级后的UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误信息
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // 如果有自定义的fallback UI，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认的错误UI
      return (
        <Card style={{ margin: '20px', maxWidth: '600px' }}>
          <Alert
            message="组件加载出错"
            description="页面组件遇到了一个错误，请尝试刷新页面或联系技术支持。"
            type="error"
            showIcon
            action={
              <Button size="small" danger onClick={this.handleRetry}>
                重试
              </Button>
            }
          />
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
              <summary>错误详情 (开发模式)</summary>
              <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;