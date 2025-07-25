import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/**
 * 初始化应用
 * 在 Tauri 环境中等待 API 初始化完成后再设置事件监听器
 */
async function initApp() {
  // 渲染 React 应用
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// 启动应用
initApp();
