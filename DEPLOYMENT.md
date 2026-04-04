# Bilibili Sync App - 正式部署指南

## 📑 目录
1. [部署前准备](#部署前准备)
2. [安全配置](#安全配置)
3. [后端部署](#后端部署)
4. [前端部署](#前端部署)
5. [监控与维护](#监控与维护)

---

## 部署前准备

### 服务器要求
- **操作系统**: Linux (推荐 Ubuntu 20.04 LTS 或更新版本)
- **内存**: 最少 2GB RAM
- **磁盘**: 根据视频存储需求选择，建议 SSD 50GB+
- **网络**: 公网 IP 或内网穿透

### 环境依赖

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.10 python3.10-venv python3-pip nodejs npm curl git

# 检查版本
python3 --version  # >= 3.10
node --version     # >= 16
npm --version      # >= 8
```

**注意**: rclone 需要单独安装，请使用您的第三方修改版 rclone。

---

## 安全配置

### 1. 环境变量配置 ⚠️ 重要

在 `backend/` 目录创建 `.env` 文件：

```env
# Flask/FastAPI环境
ENVIRONMENT=production
DEBUG=false

# API密钥 - 生成强密钥！
SECRET_API_KEY=your-very-long-random-secure-key-minimum-32-chars

# 数据库
DATABASE_URL=sqlite:///./data/app.db
# 或使用PostgreSQL: postgresql://user:password@localhost:5432/bilibili_sync

# CORS 允许的前端地址
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 文件上传限制
MAX_UPLOAD_SIZE=5368709120  # 5GB

# 日志级别
LOG_LEVEL=info

# rclone配置
RCLONE_CONFIG_PATH=/var/www/bilibili-sync-app/backend/data/.rclone.conf
```

**生成强密钥方法:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. 更新 `backend/main.py`

```python
import os
from dotenv import load_dotenv

load_dotenv()

# 从环境变量读取敏感信息
SECRET_API_KEY = os.getenv("SECRET_API_KEY", "change-me-in-production")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# CORS配置 - 生产环境需要修改
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],  # 仅允许前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 只在开发环境下启用调试
if ENVIRONMENT != "production":
    app.debug = True
```

---

## 后端部署

### 方案 A: 使用 Systemd + Gunicorn

#### 1. 设置虚拟环境

```bash
cd /opt/bilibili-sync-app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

#### 2. 创建数据目录和权限

```bash
sudo mkdir -p /var/www/bilibili-sync-app/data
sudo mkdir -p /var/www/bilibili-sync-app/logs
sudo cp -r /opt/bilibili-sync-app/backend/* /var/www/bilibili-sync-app/
sudo chown -R www-data:www-data /var/www/bilibili-sync-app
sudo chmod -R 755 /var/www/bilibili-sync-app
```

#### 3. 创建 Systemd 服务文件

创建 `/etc/systemd/system/bilibili-sync-api.service`:

```ini
[Unit]
Description=Bilibili Sync API Service
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/bilibili-sync-app
Environment="PATH=/var/www/bilibili-sync-app/venv/bin"
EnvironmentFile=/var/www/bilibili-sync-app/.env
ExecStart=/var/www/bilibili-sync-app/venv/bin/gunicorn \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --access-logfile /var/www/bilibili-sync-app/logs/access.log \
    --error-logfile /var/www/bilibili-sync-app/logs/error.log \
    main:app

Restart=always
RestartSec=10

# 安全性配置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/bilibili-sync-app

[Install]
WantedBy=multi-user.target
```

#### 4. 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable bilibili-sync-api
sudo systemctl start bilibili-sync-api
sudo systemctl status bilibili-sync-api

# 查看日志
sudo journalctl -u bilibili-sync-api -f
```

---

## 前端部署

### 方案 A: 使用 Nginx 反向代理

#### 1. 构建前端

```bash
cd frontend
npm install
npm run build
# dist/ 目录将包含构建后的文件
```

#### 2. 配置 Nginx

创建 `/etc/nginx/sites-available/bilibili-sync`:

```nginx
upstream api_backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL证书配置 (使用Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL安全配置
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 安全头
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # 根目录
    root /var/www/bilibili-sync-app/frontend/dist;
    
    # 单页面应用路由
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API代理
    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 3. 启用站点并重启 Nginx

```bash
sudo ln -s /etc/nginx/sites-available/bilibili-sync /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 4. 配置 SSL 证书 (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 监控与维护

### 1. 设置日志备份

```bash
# 创建日志轮转配置: /etc/logrotate.d/bilibili-sync
/var/www/bilibili-sync-app/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload bilibili-sync-api > /dev/null 2>&1 || true
    endscript
}
```

### 2. 监控脚本

创建 `monitoring.sh`:

```bash
#!/bin/bash

# 检查服务状态
check_service() {
    systemctl is-active --quiet bilibili-sync-api || systemctl restart bilibili-sync-api
    systemctl is-active --quiet nginx || systemctl restart nginx
}

# 检查磁盘空间
check_disk() {
    DISK_USAGE=$(df /var/www | awk 'NR==2 {print $5}' | cut -d'%' -f1)
    if [ $DISK_USAGE -gt 90 ]; then
        echo "警告: 磁盘使用率 ${DISK_USAGE}%"
    fi
}

# 清理过期日志
cleanup_logs() {
    find /var/www/bilibili-sync-app/logs -name "*.log" -mtime +30 -delete
}

check_service
check_disk
cleanup_logs
```

添加到 crontab：
```bash
sudo crontab -e
# 每小时检查一次
0 * * * * /opt/monitoring.sh
```

### 3. 性能优化建议

1. **数据库优化**
   ```bash
   # 迁移到 PostgreSQL 以获得更好的性能
   # 在 .env 中配置: DATABASE_URL=postgresql://user:pass@localhost:5432/bilibili_sync
   ```

2. **缓存层**
   ```bash
   # 安装 Redis
   sudo apt install -y redis-server
   # 在应用中集成 Redis 缓存
   ```

3. **CDN 加速**
   - 使用 Cloudflare 或阿里云 CDN 加速前端资源

4. **API 限流**
   ```python
   from fastapi_limiter import FastAPILimiter
   # 在 main.py 中配置限流规则
   ```

---

## 常见问题排查

### 后端无法启动
```bash
# 查看详细错误
sudo journalctl -u bilibili-sync-api -n 50

# 检查端口是否被占用
sudo lsof -i :8000
```

### 前端加载缓慢
```bash
# 检查 Nginx 配置
sudo nginx -t

# 查看原始 gzip 配置
curl -I https://yourdomain.com
```

### 数据库锁定
```bash
# 重启服务
sudo systemctl restart bilibili-sync-api

# 检查是否有孤立进程
ps aux | grep main
```

---

## 升级流程

```bash
# 1. 备份数据
cp -r /var/www/bilibili-sync-app/data /backup/

# 2. 停止服务
sudo systemctl stop bilibili-sync-api

# 3. 更新代码
cd /opt/bilibili-sync-app
git pull origin main

# 4. 安装新依赖
source backend/venv/bin/activate
pip install -r requirements.txt

# 5. 更新前端
cd frontend
npm install
npm run build

# 6. 重启服务
sudo systemctl start bilibili-sync-api
```

---

## 备份策略

```bash
#!/bin/bash
# 自动备份脚本 backup.sh

BACKUP_DIR="/backup/bilibili-sync"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库和配置
tar -czf $BACKUP_DIR/backup_$TIMESTAMP.tar.gz \
    /var/www/bilibili-sync-app/data \
    /var/www/bilibili-sync-app/.env

# 保留最近30天的备份
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +30 -delete

echo "备份完成: $BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
```

添加到 crontab:
```bash
# 每天半夜2点执行备份
0 2 * * * /opt/backup.sh
```

---

## 安全检查清单

- [ ] 修改 API 密钥 (SECRET_API_KEY)
- [ ] 配置 CORS 为具体的前端地址
- [ ] 启用 HTTPS/SSL 证书
- [ ] 配置防火墙规则
- [ ] 定期更新系统和依赖
- [ ] 启用日志监控
- [ ] 设置数据库备份
- [ ] 配置 fail2ban 防止 DDoS
- [ ] 隐藏版本号信息
- [ ] 配置 X-Frame-Options 等安全头

---

## 支持与维护

- 定期检查更新: `npm outdated` 及 `pip list --outdated`
- 监控磁盘使用和性能
- 定期备份和恢复测试
- 保持依赖包最新版本
