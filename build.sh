#!/bin/bash

# Bilibili Sync App - 纯净内网版编译脚本 (Tailscale + Nohup)

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
    source venv/bin/activate
    
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    pip install pyinstaller
    
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
    print_status "后端双进程编译完成"
}

build_frontend() {
    echo -e "\n${YELLOW}🎨 编译前端...${NC}"
    cd "$PROJECT_DIR/frontend"
    npm ci
    npm run build
    print_status "前端静态资源构建完成"
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
    
    # 动态生成 start.sh
    cat > "$BUILD_OUTPUT/start.sh" << 'EOF'
#!/bin/bash
chmod +x bilibili-sync-api bilibili-sync-worker
echo "🚀 启动 Bilibili-Sync-App..."
nohup ./bilibili-sync-api > api.log 2>&1 &
echo $! > api.pid
echo "[OK] API 监听进程已启动 (PID: $(cat api.pid))"
nohup ./bilibili-sync-worker > worker.log 2>&1 &
echo $! > worker.pid
echo "[OK] 下载上传工作进程已启动 (PID: $(cat worker.pid))"
echo "✅ 所有服务运行中！请查看 api.log 和 worker.log。"
EOF
    chmod +x "$BUILD_OUTPUT/start.sh"

    # 动态生成 stop.sh
    cat > "$BUILD_OUTPUT/stop.sh" << 'EOF'
#!/bin/bash
echo "🛑 停止 Bilibili-Sync-App..."
[ -f "api.pid" ] && kill -9 $(cat api.pid) 2>/dev/null && rm api.pid && echo "API 已停止"
[ -f "worker.pid" ] && kill -9 $(cat worker.pid) 2>/dev/null && rm worker.pid && echo "Worker 已停止"
pkill -f bilibili-sync-api || true
pkill -f bilibili-sync-worker || true
echo "✅ 服务已彻底关闭。"
EOF
    chmod +x "$BUILD_OUTPUT/stop.sh"

    # 生成部署说明
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
    ARCHIVE_NAME="bilibili-sync-release-$(date +%Y%m%d).tar.gz"
    tar -czf "$ARCHIVE_NAME" -C "$BUILD_OUTPUT" .
    print_status "✅ 最终产物已生成: $PROJECT_DIR/$ARCHIVE_NAME"
}

main() {
    check_build_env
    build_backend
    build_frontend
    prepare_output
    create_archive
}

main "$@"