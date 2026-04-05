#!/bin/bash

# Bilibili Sync App - 本地编译脚本
# 将后端编译为可执行文件，前端编译为静态文件

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_OUTPUT="$PROJECT_DIR/build_output"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# ========== 检查环境 ==========
check_build_env() {
    print_info "检查编译环境..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 未安装"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "NPM 未安装"
        exit 1
    fi
    
    print_status "Python: $(python3 --version)"
    print_status "NPM: $(npm --version)"
}

# ========== 编译后端 ==========
build_backend() {
    echo -e "\n${YELLOW}📦 编译后端...${NC}"
    
    cd "$PROJECT_DIR/backend"
    
    # 创建虚拟环境
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        print_status "虚拟环境已创建"
    fi
    
    source venv/bin/activate
    
    # 安装依赖 + PyInstaller
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    pip install pyinstaller
    print_status "依赖已安装"
    
    # 清理旧的编译文件
    rm -rf build dist spec 2>/dev/null || true
    
    # 使用 PyInstaller 编译为完全独立的可执行文件
    print_info "使用 PyInstaller 编译..."
    pyinstaller \
        --onefile \
        --name bilibili-sync-api \
        --add-data "data:data" \
        --hidden-import=uvicorn.logging \
        --hidden-import=uvicorn.loops \
        --hidden-import=uvicorn.protocols \
        --hidden-import=uvicorn.servers \
        --collect-all=fastapi \
        --collect-all=starlette \
        --collect-all=sqlalchemy \
        --collect-all=yt_dlp \
        --strip \
        --upx-dir=/usr/bin \
        main.py
    
    deactivate
    
    print_status "后端编译完成: $PROJECT_DIR/backend/dist/bilibili-sync-api"
}

# ========== 编译前端 ==========
build_frontend() {
    echo -e "\n${YELLOW}🎨 编译前端...${NC}"
    
    cd "$PROJECT_DIR/frontend"
    
    # 安装前端依赖
    print_info "安装前端依赖..."
    npm ci
    
    # 构建
    print_info "构建前端应用..."
    npm run build
    
    print_status "前端编译完成: $PROJECT_DIR/frontend/dist"
}

# ========== 打包输出 ==========
prepare_output() {
    echo -e "\n${YELLOW}📁 准备发布包...${NC}"
    
    mkdir -p "$BUILD_OUTPUT"
    
    # 复制后端可执行文件
    cp "$PROJECT_DIR/backend/dist/bilibili-sync-api" "$BUILD_OUTPUT/"
    chmod +x "$BUILD_OUTPUT/bilibili-sync-api"
    print_status "后端可执行文件: $BUILD_OUTPUT/bilibili-sync-api"
    
    # 复制前端静态文件
    cp -r "$PROJECT_DIR/frontend/dist" "$BUILD_OUTPUT/"
    print_status "前端静态文件: $BUILD_OUTPUT/dist/"
    
    # 复制配置文件示例
    cp "$PROJECT_DIR/.env.example" "$BUILD_OUTPUT/.env.example"
    print_status "配置文件示例: $BUILD_OUTPUT/.env.example"
    
    # 复制 Systemd 服务文件
    cp "$PROJECT_DIR/bilibili-sync-api.service" "$BUILD_OUTPUT/"
    print_status "Systemd 服务: $BUILD_OUTPUT/bilibili-sync-api.service"
    
    # 创建部署说明
    cat > "$BUILD_OUTPUT/DEPLOYMENT_GUIDE.txt" << 'EOF'
========== 部署指南 ==========

1. 上传文件到服务器
   scp -r build_output/* root@server:/opt/bilibili-sync-app/

2. 配置环境
   cd /opt/bilibili-sync-app
   cp .env.example .env
   # 编辑 .env 文件，至少修改：
   #   - SECRET_API_KEY
   #   - RCLONE_EXECUTABLE_PATH
   #   - FRONTEND_URL

3. 创建数据目录
   mkdir -p /opt/bilibili-sync-app/data
   mkdir -p /opt/bilibili-sync-app/logs
   chmod 755 /opt/bilibili-sync-app

4. 部署 Systemd 服务
   sudo cp bilibili-sync-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable bilibili-sync-api

5. 启动服务
   sudo systemctl start bilibili-sync-api
   sudo systemctl status bilibili-sync-api

6. 验证
   curl http://localhost:8000/health
   访问 http://your-server:8000
EOF
    
    print_status "部署指南: $BUILD_OUTPUT/DEPLOYMENT_GUIDE.txt"
}

# ========== 创建打包 ==========
create_archive() {
    echo -e "\n${YELLOW}📦 创建发布包...${NC}"
    
    cd "$PROJECT_DIR"
    ARCHIVE_NAME="bilibili-sync-app-release-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    tar -czf "$ARCHIVE_NAME" -C "$BUILD_OUTPUT" .
    
    print_status "发布包已创建: $PROJECT_DIR/$ARCHIVE_NAME"
    ls -lh "$PROJECT_DIR/$ARCHIVE_NAME"
}

# ========== 主流程 ==========
main() {
    echo "=========================================="
    echo "  Bilibili Sync App - 本地编译工具"
    echo "=========================================="
    
    check_build_env
    build_backend
    build_frontend
    prepare_output
    create_archive
    
    echo -e "\n${GREEN}========== 编译完成 ==========${NC}"
    echo "发布包位置: $BUILD_OUTPUT"
    echo ""
    echo "部署步骤:"
    echo "  1. 压缩包已创建，可以上传到服务器"
    echo "  2. 服务器上解压并按照 DEPLOYMENT_GUIDE.txt 操作"
    echo "  3. 配置 .env 文件后启动服务"
}

main "$@"
