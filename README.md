# 飞书文档导出助手

一个基于 Tauri + React + TypeScript 开发的跨平台桌面应用，用于批量导出飞书（Feishu/Lark）文档和文件。

## ✨ 技术特点

### 🏗️ 技术架构
- **前端框架**: React 19 + TypeScript + Vite
- **UI 组件库**: Ant Design 5.x
- **桌面框架**: Tauri 2.x (Rust)
- **数据库**: SQLite (通过 Tauri SQL 插件)
- **HTTP 客户端**: Axios + 自定义 Tauri 适配器
- **状态管理**: React Hooks

### 🔧 核心技术
- **跨平台支持**: 基于 Tauri 框架，支持 Windows、macOS、Linux
- **原生性能**: Rust 后端提供高性能文件操作和网络请求
- **安全性**: Tauri 的安全沙箱机制，最小化系统权限
- **现代化 UI**: 响应式设计，支持深色/浅色主题
- **增量下载**: 支持断点续传和任务恢复
- **并发控制**: 智能的下载任务管理和进度跟踪

## 🚀 主要功能

### 📁 文件浏览与管理
- **云盘文件浏览**: 支持浏览飞书云盘中的文件和文件夹
- **知识库导航**: 完整的知识库空间和文档树形结构展示
- **文件类型支持**: 支持文档、表格、演示文稿、PDF 等多种文件格式
- **实时搜索**: 快速定位目标文件和文档

### 📥 批量下载功能
- **选择性下载**: 支持单个文件、文件夹或整个知识库的下载
- **格式转换**: 自动将飞书文档导出为 PDF、Word、Excel 等格式
- **目录结构保持**: 下载时保持原有的文件夹层级结构
- **进度监控**: 实时显示下载进度和状态

### 🔄 任务管理
- **任务队列**: 支持多个下载任务并行执行
- **断点续传**: 网络中断后可恢复下载
- **任务历史**: 查看历史下载记录和状态
- **错误处理**: 智能重试机制和详细的错误信息

### 🔐 安全认证
- **OAuth 2.0**: 安全的飞书 OAuth 授权流程
- **Token 管理**: 自动刷新访问令牌
- **权限控制**: 最小化权限原则，仅申请必要的 API 权限

## 📋 系统要求

### 最低配置
- **操作系统**: 
  - Windows 10 (1903+) / Windows 11
  - macOS 12.0+
  - Linux (Ubuntu 18.04+, Debian 10+, CentOS 8+)
- **内存**: 4GB RAM
- **存储**: 100MB 可用空间
- **网络**: 稳定的互联网连接

### 推荐配置
- **内存**: 8GB+ RAM
- **存储**: 1GB+ 可用空间（用于缓存下载文件）
- **网络**: 宽带连接（提升下载速度）

## 🛠️ 安装与使用

### 方式一：下载预编译版本（推荐）

1. 访问 [Releases 页面](https://github.com/your-username/feishu_export_tauri/releases)
2. 下载适合您操作系统的安装包：
   - Windows: `feishu_export_x.x.x_x64_en-US.msi`
   - macOS: `feishu_export_x.x.x_x64.dmg`
   - Linux: `feishu_export_x.x.x_amd64.deb` 或 `feishu_export_x.x.x_amd64.AppImage`
3. 运行安装包并按照提示完成安装

### 方式二：从源码构建

#### 环境准备
```bash
# 安装 Node.js (推荐 18.x+)
# 安装 Rust (推荐最新稳定版)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Tauri CLI
cargo install tauri-cli
```

#### 构建步骤
```bash
# 克隆仓库
git clone https://github.com/your-username/feishu_export_tauri.git
cd feishu_export_tauri

# 安装依赖
npm install

# 开发模式运行
npm run tauri dev

# 构建生产版本
npm run tauri build
```

## 📖 使用指南

### 1. 配置飞书应用

#### 创建飞书应用
1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 记录应用的 `App ID` 和 `App Secret`

#### 配置应用权限
在应用管理后台的「权限管理」中开通以下权限：

**必需权限**:
- `docs:doc` - 查看、评论和导出文档
- `docs:document.media:download` - 下载文档中的媒体文件
- `docs:document:export` - 导出文档为其他格式
- `docx:document` - 访问新版文档
- `drive:drive` - 查看云盘信息
- `drive:file` - 查看云盘文件
- `drive:file:download` - 下载云盘文件
- `offline_access` - 获取 refresh token

#### 设置重定向 URL
在应用的「安全设置」中添加重定向 URL：
```
http://localhost:3000/callback
http://localhost:3001/callback
```

### 2. 应用配置

1. 启动应用后，首次使用会自动跳转到设置页面
2. 填写飞书应用信息：
   - **App ID**: 您的飞书应用 ID
   - **App Secret**: 您的飞书应用密钥
   - **API 端点**: 保持默认值 `https://open.feishu.cn/open-apis`
3. 点击「保存配置」

### 3. 授权登录

1. 配置完成后会跳转到授权页面
2. 点击「开始授权」按钮
3. 在弹出的浏览器窗口中完成飞书登录和授权
4. 授权成功后自动返回应用主界面

### 4. 浏览和下载文件

#### 浏览文件
- **云盘文件**: 在主界面展开「我的云盘」节点浏览文件
- **知识库**: 展开「知识库」节点浏览各个知识空间的文档

#### 下载文件
1. 选择要下载的文件或文件夹（支持多选）
2. 点击「下载选中项」按钮
3. 选择本地保存路径
4. 输入任务名称和描述（可选）
5. 点击「开始下载」

#### 管理下载任务
- 点击顶部「任务列表」查看所有下载任务
- 支持暂停、恢复、删除任务
- 点击「查看文件」可查看任务中的具体文件列表
- 点击「打开文件夹」可直接打开下载目录

## 🔧 开发指南

### 项目结构
```
feishu_export_tauri/
├── src/                    # React 前端源码
│   ├── components/         # React 组件
│   │   ├── AuthPage.tsx   # 授权页面
│   │   ├── HomePage.tsx   # 主页面
│   │   ├── TaskListPage.tsx # 任务列表
│   │   └── SettingsPage.tsx # 设置页面
│   ├── types/             # TypeScript 类型定义
│   ├── utils/             # 工具函数
│   │   ├── feishuApi.ts   # 飞书 API 封装
│   │   ├── taskManager.ts # 任务管理
│   │   └── http.ts        # HTTP 适配器
│   └── App.tsx            # 主应用组件
├── src-tauri/             # Tauri 后端源码
│   ├── src/               # Rust 源码
│   ├── capabilities/      # 权限配置
│   └── tauri.conf.json    # Tauri 配置
├── package.json           # Node.js 依赖
└── README.md             # 项目文档
```

### 开发命令
```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 类型检查
npm run build

# 构建生产版本
npm run tauri build

# 预览构建结果
npm run preview
```

### 调试技巧
- 开发模式下按 `F12` 打开开发者工具
- 查看 Rust 后端日志：`cargo tauri dev -- --verbose`
- 数据库文件位置：`src-tauri/.data/feishu_export.db`

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交 Issue
- 使用清晰的标题描述问题
- 提供详细的重现步骤
- 包含错误日志和截图（如适用）
- 说明您的操作系统和应用版本

### 提交 Pull Request
1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 开发规范
- 遵循 TypeScript 和 Rust 的最佳实践
- 添加适当的注释和文档
- 确保代码通过 lint 检查
- 为新功能添加测试用例

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

- [Tauri](https://tauri.app/) - 现代化的桌面应用框架
- [React](https://reactjs.org/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 设计语言
- [飞书开放平台](https://open.feishu.cn/) - 提供强大的 API 支持

## 📞 支持

如果您在使用过程中遇到问题，可以通过以下方式获取帮助：

- 📋 [提交 Issue](https://github.com/your-username/feishu_export_tauri/issues)
- 📧 发送邮件至：your-email@example.com
- 💬 加入讨论群：[链接]

---

⭐ 如果这个项目对您有帮助，请给我们一个 Star！
