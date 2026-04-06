#!/bin/bash

# =========================================================
# Bilibili Sync App - 纯净内网版编译脚本 (Tailscale + Nohup)
# =========================================================

# 遇到任何错误立即停止
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_OUTPUT="$PROJECT_DIR/build_output"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${YELLOW}ℹ${NC} $1"; }

check_build_env() {
    print_info "检查编译环境..."
    if ! command -v python3 &> /dev/null; then print_error "Python3 未安装"; exit 1; fi
    if ! command -v npm &> /dev/null; then print_error "NPM 未安装"; exit 1; fi
}

build_backend() {
    echo -e "\n${YELLOW}📦 编译后端 API 与 Worker...${NC}"
    cd "$PROJECT_DIR/backend"
    
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        print_status "虚拟环境已创建"
    fi
    # 激活脚本专属的虚拟环境
    source venv/bin/activate
    
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    pip install pyinstaller
    
    # 强力清理上一轮的编译残留，确保环境绝对干净
    rm -rf build dist spec 2>/dev/null || true
    
    # 1. 编译 API 进程
    print_info "正在打包 API 进程..."
    pyinstaller --onefile --name bilibili-sync-api \
        --hidden-import=uvicorn.logging \
        --hidden-import=uvicorn.loops \
        --hidden-import=uvicorn.protocols \
        --hidden-import=uvicorn.servers \
        --collect-all=fastapi \
        --collect-all=starlette \
        --collect-all=sqlalchemy \
        --strip main.py
        
    # 2. 编译 Worker 进程
    print_info "正在打包 Worker 进程..."
    pyinstaller --onefile --name bilibili-sync-worker \
        --collect-all=yt_dlp \
        --collect-all=sqlalchemy \
        --strip worker.py
    
    deactivate
    print_status "后端双进程编译完成！"
}

build_frontend() {
    echo -e "\n${YELLOW}🎨 编译前端...${NC}"
    cd "$PROJECT_DIR/frontend"
    npm ci
    npm run build
    print_status "前端静态资源构建完成！"
}

prepare_output() {
    echo -e "\n${YELLOW}📁 组装发布包...${NC}"
    rm -rf "$BUILD_OUTPUT" && mkdir -p "$BUILD_OUTPUT"
    
    # 提取可执行文件
    cp "$PROJECT_DIR/backend/dist/bilibili-sync-api" "$BUILD_OUTPUT/"
    cp "$PROJECT_DIR/backend/dist/bilibili-sync-worker" "$BUILD_OUTPUT/"
    chmod +x "$BUILD_OUTPUT/bilibili-sync-api" "$BUILD_OUTPUT/bilibili-sync-worker"
    
    # 提取前端文件
    cp -r "$PROJECT_DIR/frontend/dist" "$BUILD_OUTPUT/"
    
    # 提取配置模板
    cp "$PROJECT_DIR/.env.example" "$BUILD_OUTPUT/.env.example"
    
    # ========== 动态生成 start.sh ==========
    cat > "$BUILD_OUTPUT/start.sh" << 'EOF'
#!/bin/bash
chmod +x bilibili-sync-api bilibili-sync-worker
echo "🚀 启动 Bilibili-Sync-App..."

# 轻量级日志轮转：只保留上一台次的日志，防止把 25G 硬盘撑爆
echo "📁 归档旧日志..."
[ -f "api.log" ] && mv api.log api.log.bak
[ -f "worker.log" ] && mv worker.log worker.log.bak

nohup ./bilibili-sync-api > api.log 2>&1 &
echo $! > api.pid
echo "[OK] API 监听进程已启动 (PID: $(cat api.pid))"

nohup ./bilibili-sync-worker > worker.log 2>&1 &
echo $! > worker.pid
echo "[OK] 下载上传工作进程已启动 (PID: $(cat worker.pid))"

echo "✅ 所有服务运行中！请查看 api.log 和 worker.log。"
EOF
    chmod +x "$BUILD_OUTPUT/start.sh"

    # ========== 动态生成 stop.sh ==========
    cat > "$BUILD_OUTPUT/stop.sh" << 'EOF'
#!/bin/bash
echo "🛑 停止 Bilibili-Sync-App..."

# 优雅地停止 Python 进程 (默认 SIGTERM 15)，避免损坏 SQLite 锁
[ -f "api.pid" ] && kill $(cat api.pid) 2>/dev/null && rm api.pid && echo "API 已停止"
[ -f "worker.pid" ] && kill $(cat worker.pid) 2>/dev/null && rm worker.pid && echo "Worker 已停止"

# 兜底清理
pkill -f bilibili-sync-api || true
pkill -f bilibili-sync-worker || true

# 级联狙杀：彻底清除可能游荡在后台的 rclone 僵尸上传进程
echo "🧹 清理后台残留的网络传输子进程..."
pkill -f rclone || true

echo "✅ 服务已彻底关闭。"
EOF
    chmod +x "$BUILD_OUTPUT/stop.sh"

    # ========== 生成部署说明 ==========
    cat > "$BUILD_OUTPUT/DEPLOYMENT_GUIDE.txt" << 'EOF'
========== 🚀 零依赖内网部署指南 ==========

1. 解压文件到服务器任意目录 (例如 /opt/bilibili-sync)
2. 复制配置文件: cp .env.example .env
3. 配置 .env:
   - 填入你的 Tailscale IP (LISTEN_HOST=100.x.x.x)
   - 修改 SECRET_API_KEY
   - 确认 rclone 路径 (RCLONE_EXECUTABLE_PATH)
4. 启动服务: ./start.sh
5. 停止服务: ./stop.sh
6. 访问: http://你的Tailscale_IP:8000
EOF
}

create_archive() {
    echo -e "\n${YELLOW}📦 创建压缩包...${NC}"
    cd "$PROJECT_DIR"
    
    # 定义解压后你希望服务器上生成的目录名
    RELEASE_DIR="bilibili-sync"
    ARCHIVE_NAME="${RELEASE_DIR}-release-$(date +%Y%m%d).tar.gz"
    
    # 清理可能残留的同名旧目录防止冲突
    rm -rf "$RELEASE_DIR" 2>/dev/null || true
    
    # 核心魔法：将 build_output 临时重命名为你想要的目录名
    mv "$BUILD_OUTPUT" "$RELEASE_DIR"
    
    # 此时打包，整个文件夹连同外壳一起被压入 tar
    tar -czf "$ARCHIVE_NAME" "$RELEASE_DIR"
    
    # 提上裤子恢复原状，不影响你本地的开发环境和下次打包
    mv "$RELEASE_DIR" "$BUILD_OUTPUT"
    
    print_status "✅ 最终产物已生成: $PROJECT_DIR/$ARCHIVE_NAME"
    print_info "💡 提示: 在服务器执行解压后，会自动生成并放进纯净的 ${RELEASE_DIR}/ 目录中"
}

# ================= 主控制流 =================
main() {
    check_build_env
    build_backend
    build_frontend
    prepare_output
    create_archive
}

# 执行主控制流
main "$@"