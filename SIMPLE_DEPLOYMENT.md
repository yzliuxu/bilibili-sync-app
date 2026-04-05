# Bilibili Sync App - 简化部署指南

## 方式：本地编译 → 服务器部署

### 第一步：本地编译（在您的开发机上）

```bash
cd /path/to/bilibili-sync-app

# 赋予编译脚本执行权限
chmod +x build.sh

# 运行编译脚本
./build.sh
```

编译完成后，会在项目根目录生成：
- `bilibili-sync-app-release-YYYYMMDD-HHMMSS.tar.gz` - 发布包

这个压缩包包含：
- `bilibili-sync-api` - 后端可执行文件
- `dist/` - 前端静态文件
- `.env.example` - 环境配置模板
- `bilibili-sync-api.service` - Systemd 服务文件
- `DEPLOYMENT_GUIDE.txt` - 部署指南

---

### 第二步：上传到服务器

```bash
# 从本地上传到服务器
scp bilibili-sync-app-release-*.tar.gz root@your-server:/opt/

# SSH 连接服务器
ssh root@your-server

# 进入上传目录
cd /opt

# 解压
tar -xzf bilibili-sync-app-release-*.tar.gz -C /opt/bilibili-sync-app/
```

---

### 第三步：配置环境

**在服务器上执行：**

```bash
cd /opt/bilibili-sync-app

# 复制环境配置模板
cp .env.example .env

# 编辑配置文件
nano .env
```

**必须配置的项：**

```env
# API 密钥（生成强密钥）
SECRET_API_KEY=your-secure-key-here

# Rclone 可执行文件位置（重要！）
RCLONE_EXECUTABLE_PATH=/path/to/your/rclone

# Rclone 配置文件位置
RCLONE_CONFIG_PATH=/path/to/your/rclone.conf

# 前端 URL
FRONTEND_URL=https://yourdomain.com

# 允许的来源
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

### 第四步：自动部署

**在服务器上执行部署脚本：**

```bash
# 赋予脚本执行权限
chmod +x /opt/bilibili-sync-app/deploy-server.sh

# 运行部署脚本（需要 root 权限）
sudo /opt/bilibili-sync-app/deploy-server.sh
```

部署脚本会自动：
1. ✓ 创建必要目录
2. ✓ 验证 .env 配置
3. ✓ 部署后端可执行文件
4. ✓ 部署前端静态文件
5. ✓ 注册 Systemd 服务
6. ✓ 启动服务

---

### 第五步：验证部署

```bash
# 检查服务状态
systemctl status bilibili-sync-api

# 查看日志
journalctl -u bilibili-sync-api -f

# 测试后端 API
curl http://127.0.0.1:8000/health

# 测试前端
curl http://127.0.0.1/
```

---

## 常用管理命令

```bash
# 查看服务状态
sudo systemctl status bilibili-sync-api

# 启动服务
sudo systemctl start bilibili-sync-api

# 停止服务
sudo systemctl stop bilibili-sync-api

# 重启服务
sudo systemctl restart bilibili-sync-api

# 查看实时日志
sudo journalctl -u bilibili-sync-api -f

# 查看最近 20 行日志
sudo journalctl -u bilibili-sync-api -n 20
```

---

## 文件位置约定

| 文件/目录 | 位置 |
|-----------|------|
| 应用主目录 | `/opt/bilibili-sync-app/` |
| 后端可执行文件 | `/opt/bilibili-sync-app/bilibili-sync-api` |
| 前端静态文件 | `/var/www/bilibili-sync-app/frontend/dist/` |
| 数据目录 | `/opt/bilibili-sync-app/data/` |
| 日志目录 | `/opt/bilibili-sync-app/logs/` |
| 配置文件 | `/opt/bilibili-sync-app/.env` |
| Systemd 服务 | `/etc/systemd/system/bilibili-sync-api.service` |

---

## 生成强密钥

如果需要生成 `SECRET_API_KEY`，在任何安装了 Python 的机器上运行：

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## 更新应用

当需要更新应用时：

```bash
# 1. 本地重新编译
./build.sh

# 2. 上传新的发布包到服务器
scp bilibili-sync-app-release-*.tar.gz root@your-server:/tmp/

# 3. 在服务器上停止旧服务
sudo systemctl stop bilibili-sync-api

# 4. 解压新文件到应用目录
sudo tar -xzf /tmp/bilibili-sync-app-release-*.tar.gz -C /opt/bilibili-sync-app/

# 5. 重启服务
sudo systemctl restart bilibili-sync-api
```

---

## 故障排查

### 服务无法启动

```bash
# 查看详细错误日志
sudo journalctl -u bilibili-sync-api -n 50

# 检查可执行文件权限
ls -la /opt/bilibili-sync-app/bilibili-sync-api

# 测试可执行文件
/opt/bilibili-sync-app/bilibili-sync-api --help
```

### 无法连接后端

```bash
# 检查端口是否监听
netstat -tuln | grep 8000

# 检查防火墙
sudo ufw status

# 测试本地连接
curl http://127.0.0.1:8000/health
```

### 前端无法加载

```bash
# 检查前端文件是否存在
ls -la /var/www/bilibili-sync-app/frontend/dist/

# 检查后端日志
journalctl -u bilibili-sync-api -f
```

---

## 支持的 rclone 版本

本项目支持任何 rclone 可执行文件（官方版本或第三方修改版）。

只需在 `.env` 中指定正确的路径即可：

```env
RCLONE_EXECUTABLE_PATH=/path/to/your/rclone
```

验证 rclone 是否可用：

```bash
/path/to/your/rclone --version
```

---

完成！部署就这么简单。😊
