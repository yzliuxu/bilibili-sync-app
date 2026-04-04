# Bilibili Sync App - 快速部署参考

## 🚀 快速开始 (5-10 分钟)

```bash
# 1. 克隆项目
git clone <repo-url>
cd bilibili-sync-app

# 2. 运行部署脚本
bash deploy.sh production

# 3. 配置环境
cp .env.example .env
# 编辑 .env，修改 SECRET_API_KEY

# 4. 配置 Nginx
sudo cp nginx.conf.example /etc/nginx/sites-available/bilibili-sync
# 编辑并替换 yourdomain.com
sudo ln -s /etc/nginx/sites-available/bilibili-sync /etc/nginx/sites-enabled/

# 5. 申请 SSL 证书
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com

# 6. 测试并启动
sudo nginx -t
sudo systemctl restart nginx bilibili-sync-api

# 7. 验证
curl https://yourdomain.com  # 前端
curl https://yourdomain.com/api/docs  # API 文档
```

---

## 📋 部署前检查清单

- [ ] 服务器可访问（SSH、防火墙配置）
- [ ] Python 3.10+ 已安装
- [ ] Node.js 16+ 已安装
- [ ] npm 已安装
- [ ] 域名解析正确
- [ ] 防火墙开放 80、443 端口
- [ ] 至少 2GB RAM 可用

---

## 🔐 安全配置

### 1. 生成强密钥
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```
复制输出到 `.env` 的 `SECRET_API_KEY`

### 2. 启用 HTTPS
```bash
# 使用 Let's Encrypt
sudo certbot certonly --nginx -d yourdomain.com

# Nginx 会自动配置
```

### 3. 配置 CORS
编辑 `backend/main.py`，设置允许的来源：
```python
FRONTEND_URL = "https://yourdomain.com"
```

---

##  服务管理 (Systemd)

```bash
# 启动服务
sudo systemctl start bilibili-sync-api

# 停止服务
sudo systemctl stop bilibili-sync-api

# 重启服务
sudo systemctl restart bilibili-sync-api

# 查看状态
sudo systemctl status bilibili-sync-api

# 查看日志
sudo journalctl -u bilibili-sync-api -f

# 启用开机自启
sudo systemctl enable bilibili-sync-api
```

---

## 🔧 常见问题

### 无法连接后端

```bash
# 检查 API 是否运行
curl http://localhost:8000/health

# 查看错误日志
sudo journalctl -u bilibili-sync-api -n 50

# 检查端口占用
sudo lsof -i :8000
```

### Nginx 报错

```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 重启 Nginx
sudo systemctl restart nginx
```

### 数据库无法访问

```bash
# 检查数据库文件权限
ls -la /var/www/bilibili-sync-app/data/

# 重新创建数据库
cd /var/www/bilibili-sync-app
source venv/bin/activate
python3 -c "from database import engine; from models import Base; Base.metadata.create_all(bind=engine)"
```

---

## 💾 备份与恢复

### 备份
```bash
bash backup.sh backup
# 输出: /backup/bilibili-sync/backup_20240101_120000.tar.gz
```

### 恢复
```bash
bash backup.sh list
bash backup.sh restore /backup/bilibili-sync/backup_20240101_120000.tar.gz
```

### 列出备份
```bash
bash backup.sh list
bash backup.sh stats
```

---

## 📈 性能优化

### 增加并发工作进程
编辑 Systemd 服务配置文件 `bilibili-sync-api.service`：
```bash
# 从 4 调整为 8
--workers 8
```

### 迁移到 PostgreSQL
```bash
# 安装 PostgreSQL
sudo apt install postgresql

# 更新 .env
DATABASE_URL=postgresql://user:password@localhost:5432/bilibili_sync
```

### 启用 Redis 缓存
```bash
# 安装 Redis
sudo apt install redis-server

# 更新 backend/main.py 中集成 Redis 缓存
```

---

## 🔍 监控

### 创建监控脚本
```bash
# 复制并修改权限
chmod +x monitoring.sh

# 添加到 crontab
sudo crontab -e
# 添加: 0 * * * * /path/to/monitoring.sh
```

---

## 📝 日志位置

- **后端**: `/var/www/bilibili-sync-app/logs/`
- **Nginx**: `/var/log/nginx/`
- **Systemd**: `journalctl -u bilibili-sync-api`

---

## 🔄 升级流程

```bash
# 1. 备份
bash backup.sh backup

# 2. 停止服务
sudo systemctl stop bilibili-sync-api

# 3. 更新代码
cd /opt/bilibili-sync-app
git pull origin main

# 4. 安装新依赖
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# 5. 构建前端
cd frontend && npm install && npm run build

# 6. 重启
sudo systemctl start bilibili-sync-api
```

---

## 📞 获取帮助

- 查看完整文档: [DEPLOYMENT.md](DEPLOYMENT.md)
- API 文档: `https://yourdomain.com/docs`
- 问题排查: [常见问题](#常见问题)

---

## ✅ 验证部署成功

```bash
# 1. 检查前端
curl -I https://yourdomain.com

# 2. 检查后端 API
curl -H "X-API-Key: your-secret-key" https://yourdomain.com/api/health

# 3. 查看数据库
sqlite3 /var/www/bilibili-sync-app/data/app.db ".tables"

# 4. 所有服务状态
sudo systemctl status bilibili-sync-api nginx
```

---

**最后更新**: 2024-04-04  
**版本**: 1.0.0  
**维护者**: Bilibili Sync App Team
