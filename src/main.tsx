import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; 
import { listen } from '@tauri-apps/api/event';

// 监听 Rust 端发过来的事件
listen('auth_callback', (event) => {
  console.log('收到来自 Rust 的事件:', event.payload);
});
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
