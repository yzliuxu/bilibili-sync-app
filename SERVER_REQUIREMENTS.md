# 服务器部署前检查清单

## 📋 服务器上需要的东西

在运行 `deploy-server.sh` 之前，确保服务器已准备好：

### ✅ 必须安装

| 软件 | 用途 | 安装命令 |
|------|------|--------|
| **rclone** | 云端上传（您的第三方版本） | 自己上传到 `/usr/local/bin/` |

### ℹ️ 系统自带（无需安装）

| 软件 | 用途 |
|------|------|
| **systemd** | 服务管理 |
| **curl** | HTTP 测试（可选） |

### ⚠️ 可选但推荐

| 软件 | 用途 | 
|------|------|
| **Python3** | 某些 PyInstaller 编译文件可能需要 |

---

## 🚀 快速部署流程

### 1. 检查服务器依赖

在项目目录中编译脚本后，您可以获得：

```bash
# 将检查脚本上传到服务器
scp check-server-deps.sh root@server:/tmp/

# 在服务器上运行检查
sudo bash /tmp/check-server-deps.sh
```

### 2. 安装缺失的依赖

**Ubuntu/Debian：**

```bash
# 上传您的 rclone 可执行文件到服务器
scp /path/to/your/rclone root@server:/usr/local/bin/
sudo chmod +x /usr/local/bin/rclone

# 验证 rclone
/usr/local/bin/rclone --version
```

**CentOS/RHEL：**

```bash
# 上传您的 rclone 可执行文件
scp /path/to/your/rclone root@server:/usr/local/bin/
sudo chmod +x /usr/local/bin/rclone
```

### 3. 准备发布包

在本地编译完成后，会生成：

```
bilibili-sync-app-release-YYYYMMDD-HHMMSS.tar.gz
```

包含内容：
- ✓ 后端二进制可执行文件（无需 Python 运行时）
- ✓ 前端静态文件（无需 npm）
- ✓ 配置文件模板
- ✓ 部署脚本

### 4. 上传到服务器

```bash
scp bilibili-sync-app-release-*.tar.gz root@server:/opt/
ssh root@server

# 在服务器上
cd /opt
tar -xzf bilibili-sync-app-release-*.tar.gz -C /opt/bilibili-sync-app/
```

### 5. 配置环境

```bash
cd /opt/bilibili-sync-app
cp .env.example .env
nano .env

# 必须配置
# SECRET_API_KEY=你的密钥
# RCLONE_EXECUTABLE_PATH=/usr/local/bin/rclone
# FRONTEND_URL=https://yourdomain.com
```

### 6. 运行部署脚本

```bash
chmod +x /opt/bilibili-sync-app/deploy-server.sh
sudo /opt/bilibili-sync-app/deploy-server.sh
```

---

## 📊 文件大小参考

| 文件 | 大小 | 说明 |
|------|------|------|
| 后端可执行文件 | ~100-150MB | 包含所有依赖 |
| 前端静态文件 | ~5-10MB | 压缩后的 React 应用 |
| 发布包压缩 | ~30-50MB | tar.gz 压缩后 |

---

## 🔍 部署后验证

服务器本地验证：

```bash
# 检查后端服务
curl -H "X-API-Key: $(grep SECRET_API_KEY /opt/bilibili-sync-app/.env | cut -d= -f2)" \
     http://127.0.0.1:8000/health

# 检查前端
curl http://127.0.0.1/

# 查看服务状态
sudo systemctl status bilibili-sync-api

# 查看日志
sudo journalctl -u bilibili-sync-api -f
```

---

## 💾 磁盘空间要求

- **应用目录**（`/opt/bilibili-sync-app/`）：150MB
- **数据目录**（`/opt/bilibili-sync-app/data/`）：根据下载量而定
- **前端目录**（`/var/www/bilibili-sync-app/frontend/`）：10MB
- **日志目录**（`/opt/bilibili-sync-app/logs/`）：根据日志量而定

**建议总计**：至少 1GB 可用空间

---

## 🎯 总结

**编译端（本地开发机）需要：**
- Python3 + pip
- Node.js + npm
- PyInstaller（部署脚本会安装）

**部署端（服务器）需要：**
- 您的 rclone 可执行文件
- sudo 权限（用于 systemd）

**编译好后上传到服务器的包含：**
- 独立的后端二进制可执行文件（无需 Python 运行时）
- 前端静态文件（无需 npm）
- 所有配置和部署脚本

**就这么简单！** ✨
