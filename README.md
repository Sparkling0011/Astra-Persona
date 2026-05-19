# Astra Persona

一个基于 Vue 3 + TypeScript + Vite 的 AI 身份资产工作台。它可以生成头像、名称、签名、简介、关键词，并提供头像 Canvas 编辑、局部重绘、资产包导出和分享二维码。

![Astra Persona screenshot](./docs/screenshots/home.png)

## 功能

- 生成完整身份资产：头像、显示名称、账号名称、签名、简介、关键词。
- 多头像变体：支持选择主视觉、重新生成头像变体。
- Canvas 图片编辑：框选局部重绘、滤镜、文字、水印、裁剪、PNG 导出。
- 资产包导出：ZIP 包含 `persona-kit.json`、说明文件和头像图片。
- 分享链接与二维码：生成当前身份资产的本地分享链接和二维码。
- 资产库：Pinia + `pinia-plugin-persistedstate` 持久化。
- 简述历史和生成参数：头像数量、尺寸、生成强度。
- PWA：可安装、离线缓存基础静态资源和头像资源。
- 性能优化：懒加载图片、虚拟列表、Web Worker 图像处理、路由懒加载。

## 技术栈

- Vue 3.5 + Composition API + `<script setup>`
- TypeScript strict mode
- Vite 8
- Pinia + pinia-plugin-persistedstate
- Vue Router 4
- Tailwind CSS
- Axios / Fetch
- Vite PWA
- JSZip
- QRCode
- Canvas + Web Worker

## 快速开始

```bash
nvm use
pnpm install
pnpm dev
```

默认开发地址：

```bash
http://localhost:5174/
```

生产构建：

```bash
pnpm build
pnpm preview
```

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

默认使用本地 mock：

```env
VITE_USE_REAL_AI=false
```

启用真实 AI：

```env
VITE_USE_REAL_AI=true
VITE_AI_TEXT_PROVIDER=doubao
VITE_AI_TEXT_API_KEY=your_volcengine_ark_api_key
VITE_AI_TEXT_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VITE_AI_TEXT_MODEL=doubao-seed-2-0-pro-260215
VITE_AI_TEXT_CHAT_PATH=/chat/completions
VITE_AI_TEXT_RESPONSE_FORMAT_ENABLED=false
VITE_AI_REQUEST_TIMEOUT_MS=45000

# 可选：doubao-seed-2-0-pro-260215 是文本输出模型，不直接生成图片。
# 头像图片可留空使用本地 fallback，或另配火山方舟图片生成模型。
VITE_AI_IMAGE_API_KEY=
VITE_AI_IMAGE_MODEL=
```

注意：`VITE_` 变量会暴露到浏览器端。生产环境建议通过后端代理保存 API Key。

## 关键目录

```text
src/
  api/                  # 身份生成 API 与 mock/真实 AI 切换
  components/persona/   # 生成器、结果卡片、头像编辑器
  components/ui/        # 基础 UI 与 VirtualList
  services/             # AI、导出、分享、Worker client
  stores/               # Pinia 应用状态
  types/                # Persona 类型定义
  workers/              # 图像处理 Web Worker
```

## Lighthouse 优化建议

- Performance：继续拆分大组件，必要时把 `ImageEditor` 改为异步组件。
- Performance：为远程头像域名添加 `preconnect`，真实生产域名确定后再加入。
- Accessibility：为 Canvas 编辑区域补充键盘可访问的选区输入。
- Best Practices：生产环境使用 HTTPS 和后端代理隐藏 API Key。
- SEO：上线后补充真实 `og:image`，避免使用 favicon 作为分享图。
- PWA：生产部署时验证 `sw.js` 缓存策略，避免缓存 AI 接口响应。

## 主要命令

```bash
pnpm type-check
pnpm build
pnpm preview
```
