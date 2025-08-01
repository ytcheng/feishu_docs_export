# 发布指南

本文档说明如何使用 GitHub Actions 自动构建和发布飞书文档导出助手。

## 🚀 自动发布流程

### 1. 准备发布

确保您的代码已经准备好发布：

```bash
# 确保所有更改已提交
git add .
git commit -m "feat: 准备发布 v1.0.0"
git push origin main
```

### 2. 创建发布标签

使用语义化版本号创建 Git 标签：

```bash
# 创建标签（例如 v1.0.0）
git tag v1.0.0

# 推送标签到远程仓库
git push origin v1.0.0
```

### 3. 自动构建

推送标签后，GitHub Actions 将自动：

1. **多平台构建**：
   - Windows (x64)
   - macOS (Intel x64)
   - macOS (Apple Silicon aarch64)
   - Linux (x64)

2. **生成安装包**：
   - Windows: `.msi` 安装程序
   - macOS: `.dmg` 磁盘映像
   - Linux: `.deb` 和 `.AppImage` 包

3. **创建 Release**：
   - 自动创建 GitHub Release
   - 上传所有平台的安装包
   - 生成发布说明

### 4. 发布管理

构建完成后：

1. 访问 [Releases 页面](https://github.com/ytcheng/feishu_docs_export/releases)
2. 找到新创建的 Draft Release
3. 编辑发布说明，添加更新内容
4. 点击 "Publish release" 正式发布

## 📋 版本号规范

使用 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- `v1.0.0` - 主要版本（重大更新）
- `v1.1.0` - 次要版本（新功能）
- `v1.0.1` - 修订版本（Bug 修复）

## 🔧 手动触发构建

如果需要手动触发构建：

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Release" 工作流
3. 点击 "Run workflow"
4. 选择分支并运行

## 📝 发布检查清单

发布前请确认：

- [ ] 代码已通过所有测试
- [ ] 版本号已更新（`src-tauri/tauri.conf.json`）
- [ ] 更新日志已准备
- [ ] 文档已更新
- [ ] 所有依赖已更新到稳定版本

## 🐛 故障排除

### 构建失败

1. 检查 Actions 日志中的错误信息
2. 确保所有依赖都已正确安装
3. 验证 Rust 和 Node.js 版本兼容性

### 签名问题

- **macOS**: 需要配置代码签名证书
- **Windows**: 需要配置代码签名证书
- 可以在 GitHub Secrets 中配置签名密钥

### 权限问题

确保 GitHub Token 有足够权限：
- `contents: write` - 创建 Release
- `actions: read` - 读取工作流状态

## 📚 相关文档

- [Tauri 构建指南](https://tauri.app/v1/guides/building/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [语义化版本规范](https://semver.org/)