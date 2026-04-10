流浪B站计划 (Bilibili Sync App)

这是一个自动化工具，旨在将 Bilibili 的视频（包括单个视频、合集、播放列表）高效地同步到云端存储（如 115 网盘）。它采用“下载一个、上传一个、即时销毁一个”的流水线模式，极大降低了对本地硬盘空间的依赖。主要我的 VPS 硬盘太小了，一次性下完可能会撑爆硬盘。

在实际的使用中，我是在 VPS 上部署了这个项目，然后使用 Tailscale 将项目部署在虚拟网络上，规避了域名备案的问题并尽可能地提高了安全性（毕竟这种工具只有自己会访问）。

🌟 核心特性

   - 智能任务拆解：支持输入 Bilibili 合集、系列或 UP 主主页链接，系统会自动将其展开为多个独立的视频下载任务。

   - 流水线式作业：严格遵循原子化工作流——下载完成后立即上传，上传成功后立即删除本地文件。本地硬盘仅需预留单个最大视频的空间。

   - 高性能后端：基于 FastAPI 开发，使用 SQLite WAL 模式确保读写并发性能。

   - 实时状态追踪：前端通过轮询机制展示每个任务的下载百分比、弹幕下载状态、评论下载状态以及云端同步进度。

   - 便捷的 Cookie 管理：支持在 Web 页面直接粘贴 yt-dlp 的 Netscape 格式 Cookie 和 115 网盘的原始 Cookie 字符串，系统会自动提取并生成 rclone 配置。

🛠️ 技术栈

   - 前端: React, Vite, Tailwind CSS, Axios

   - 后端: FastAPI, SQLAlchemy (SQLite), Uvicorn

   - 核心工具: yt-dlp (视频抓取), rclone (云端搬运), ffmpeg (音视频转码/合并)

🚀 快速开始
1. 环境准备

确保你的服务器已安装以下组件：

   - Python 3.9+

   - Node.js (用于前端构建)

   - FFmpeg (用于音视频合并)

   - Rclone (需要使用支持115网盘的版本)

2. 后端配置

    进入 backend 目录，安装依赖：
    ```Bash

   pip install -r requirements.txt
   ```
    参考 .env.example 创建 .env 文件，配置 API 访问密钥和工具路径。

   启动 API 服务：
    ```Bash

   python main.py
   ```
   启动后台处理进程 (Worker)：
   ```Bash
   python worker.py
   ```
3. 前端部署

    进入 frontend 目录，安装依赖并构建：
  
   ```Bash
   npm install
   npm run build
   ```

📂 项目结构
```Plaintext

├── backend/
│   ├── main.py        # FastAPI 接口服务，负责任务分发与鉴权
│   ├── worker.py      # 核心后台进程，执行下载、解析与上传逻辑
│   ├── database.py    # 数据库连接与 WAL 性能优化配置
│   ├── models.py      # SQLAlchemy 数据模型
│   └── schemas.py     # Pydantic 数据验证模型
├── frontend/
│   ├── src/
│   │   ├── App.jsx    # 前端主逻辑，包含状态同步与 Cookie 处理
│   │   └── utils/api.js # Axios 拦截器与 API 封装
└── data/              # 自动创建：存放数据库、Cookies 及临时文件
```
📝 TODO 

以下是本项目计划在未来版本中实现的功能：
🛠️ 系统优化

    [ ] Cookies：目前 115 不支持使用 Cookies 自动组装成 Rclone 能读取的配置文件，需要手动组装。

    [ ] 容器化部署：提供 Docker 一键部署镜像，内置所有环境依赖。

✨ 功能增强

    [ ] 更精细的过滤规则：支持按投稿时间范围、点赞数或关键词过滤合集中的视频。

    [ ] 增量同步模式：对 UP 主主页任务支持“定时扫描”，仅同步新增投稿。

    [ ] 视频信息备份：除了视频，自动备份封面图、简介文本及交互数据为本地 Markdown 或 JSON。

    [ ] 自动获取 Cookies：保存帐号密码，自动登录获取 Cookies。

📱 交互体验

    [ ] 响应式适配：优化移动端显示效果，方便在手机上随时丢链接进行同步。

    [ ] 配置可视化检查：在设置页面实时检测 yt-dlp 和 rclone 的可用性。

注意：本工具仅供个人学习研究及备份自己喜爱的内容使用，请务必遵守 Bilibili 相关平台规定及法律法规。
