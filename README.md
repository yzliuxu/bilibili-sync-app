# Bilibili Sync App

一个功能强大的视频同步和备份工具，支持从Bilibili、YouTube等平台下载视频，并自动备份到云端存储。

## 🎯 功能特性

- **视频下载**: 支持下载Bilibili、YouTube等多个平台的视频
- **多维度备份**: 同时下载视频、弹幕、字幕、评论等内容
- **云端存储**: 集成rclone，支持上传到115网盘等云存储服务
- **任务管理**: Web界面管理下载任务，实时跟踪下载进度
- **API鉴权**: 通过API Key保护，支持本地部署
- **自动工作流**: 后台异步处理任务，支持批量下载

## 📋 项目结构

```
bilibili-sync-app/
├── backend/              # FastAPI后端服务
│   ├── main.py           # 主服务文件，API接口定义
│   ├── models.py         # 数据库模型（任务表）
│   ├── schemas.py        # Pydantic数据验证schema
│   ├── database.py       # 数据库连接配置
│   ├── worker.py         # 后台任务处理模块
│   ├── requirements.txt   # Python依赖
│   └── data/             # 配置文件和下载数据存储目录
│
└── frontend/             # React前端应用
    ├── src/
    │   ├── App.jsx       # 主应用组件
    │   ├── components/   # React组件
    │   └── utils/        # 工具函数（API调用等）
    ├── package.json      # Node依赖
    ├── vite.config.js    # Vite配置
    └── eslint.config.js  # ESLint规则
```

## 🚀 快速开始

### 前置要求

- Python 3.8+
- Node.js 16+
- rclone（用于云端存储上传，请使用您的第三方修改版）

### 后端安装

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 修改API密钥（重要！）
# 编辑 main.py，修改 SECRET_API_KEY 变量

# 启动服务
uvicorn main:app --reload
```

后端将运行在 `http://localhost:8000`

### 前端安装

```bash
cd frontend

# 安装依赖
npm install

# 开发模式启动
npm run dev

# 构建生产版本
npm run build
```

前端将运行在 `http://localhost:5173`

## 🔑 配置说明

### 后端配置

1. **API密钥** (`backend/main.py`)
   ```python
   SECRET_API_KEY = "123456"  # 改为你的复杂密码
   ```

2. **Rclone配置** (`backend/data/rclone.conf`)
   - 配置你的云端存储服务（如115网盘）
   - 远程名称: `115:/yt_downloads`

3. **Cookie文件** (可选)
   - YouTube Cookie: `backend/data/yt_cookies.txt`
   - 用于下载受限制的视频内容

### 前端配置

- API地址在 `frontend/src/utils/api.js` 中配置
- 默认匹配后端的 `http://localhost:8000`

## 📱 使用方式

1. **启动服务**
   - 后端: `python -m uvicorn main:app --reload`
   - 前端: `npm run dev`

2. **登录**
   - 打开 `http://localhost:5173`
   - 输入在后端配置的API Key（默认 `123456`）

3. **添加任务**
   - 在前端输入视频URL
   - 配置下载选项（字幕、弹幕、评论等）
   - 点击"添加任务"

4. **监控进度**
   - 实时查看任务状态
   - 显示下载、上传的进度

## 🔌 API接口

### 鉴权
所有请求需要在Header中包含API Key：
```
X-API-Key: your-secret-key
```

### 主要端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/verify` | 验证API Key |
| GET | `/api/tasks` | 获取所有任务 |
| POST | `/api/tasks` | 创建新任务 |
| GET | `/api/tasks/{id}` | 获取任务详情 |
| DELETE | `/api/tasks/{id}` | 删除任务 |

## 📊 任务状态字段

```python
- status: 任务总体状态 (pending/processing/completed/failed)
- video_downloaded: 视频下载完成
- danmaku_downloaded: 弹幕下载完成
- comment_downloaded: 评论下载完成
- video_uploaded: 视频上传完成
- danmaku_uploaded: 弹幕上传完成
- comment_uploaded: 评论上传完成
```

## 🛠 技术栈

### 后端
- **FastAPI**: 现代化Python Web框架
- **SQLAlchemy**: ORM数据库操作
- **SQLite**: 轻量级数据库
- **yt-dlp**: 视频下载引擎
- **uvicorn**: ASGI服务器

### 前端
- **React 19**: UI框架
- **Vite**: 快速构建工具
- **Tailwind CSS**: 样式框架
- **Axios**: HTTP客户端

## 🔐 安全建议

- **生产环境**:
  - 修改默认API Key为强密码
  - 将CORS配置从 `"*"` 改为特定域名
  - 使用HTTPS
  - 部署反向代理（如Nginx）

- **数据安全**:
  - 妥善保管cookie文件
  - 定期备份数据库
  - 不在代码中提交敏感配置

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## ❓ 常见问题

**Q: 如何加速下载？**
A: 配置合适的Cookie文件，使用代理服务，或增加并发数量。

**Q: 云端存储如何配置？**
A: 编辑 `backend/data/rclone.conf`，配置你的存储服务（如115网盘）。

**Q: 支持哪些视频平台？**
A: 支持yt-dlp支持的所有平台，包括Bilibili、YouTube等。

---

**最后更新**: 2026年4月  
**项目状态**: 活跃开发中