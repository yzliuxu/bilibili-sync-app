#!/bin/bash

# Bilibili Sync App - 快速部署脚本
# 用法: bash deploy.sh [production|dev]

set -e

DEPLOY_ENV=${1:-production}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🚀 开始部署 Bilibili Sync App..."
echo "📍 项目路径: $PROJECT_DIR"
echo "🔧 部署模式: $DEPLOY_ENV"

# ============= 颜色定义 =============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ============= 环境检查 =============
check_prerequisites() {
    echo -e "\n${YELLOW}🔍 检查环境依赖...${NC}"
    
    local missing_deps=()
    
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("node.js")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "缺少依赖: ${missing_deps[*]}"
        echo "请先安装缺失的依赖包"
        exit 1
    fi
    
    print_status "Python 版本: $(python3 --version)"
    print_status "Node 版本: $(node --version)"
    print_status "NPM 版本: $(npm --version)"
}

# ============= 后端部署 =============
deploy_backend() {
    echo -e "\n${YELLOW}📦 部署后端...${NC}"
    
    cd "$BACKEND_DIR"
    
    # 创建虚拟环境
    if [ ! -d "venv" ]; then
        print_status "创建 Python 虚拟环境..."
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    print_status "虚拟环境已激活"
    
    # 安装依赖
    print_status "安装 Python 依赖..."
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    
    if [ "$DEPLOY_ENV" = "production" ]; then
        pip install gunicorn uvicorn
    fi
    
    # 检查 .env 文件
    if [ ! -f ".env" ]; then
        print_warning "未找到 .env 文件，创建默认配置..."
        cat > .env << 'EOF'
# Bilibili Sync App - 环境配置
ENVIRONMENT=production
DEBUG=false

# ⚠️ 生成新的 API KEY: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_API_KEY=change-me-in-production

DATABASE_URL=sqlite:///./data/app.db
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost

MAX_UPLOAD_SIZE=5368709120
LOG_LEVEL=info
EOF
        print_warning "⚠️  请修改 .env 中的 SECRET_API_KEY！"
    fi
    
    # 创建数据目录
    mkdir -p data logs
    print_status "数据目录已创建"
    
    # 初始化数据库
    python3 << 'PYEOF'
from database import engine
from models import Base
Base.metadata.create_all(bind=engine)
print("✓ 数据库已初始化")
PYEOF
    
    deactivate
    print_status "后端部署完成"
}

# ============= 前端部署 =============
deploy_frontend() {
    echo -e "\n${YELLOW}🎨 部署前端...${NC}"
    
    cd "$FRONTEND_DIR"
    
    # 安装依赖
    print_status "安装 Node 依赖..."
    npm ci
    
    # 更新 config.js
    if [ ! -f "src/config.js" ]; then
        print_warning "创建前端配置文件..."
        cat > src/config.js << 'EOF'
// API 配置
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const API_KEY = import.meta.env.VITE_API_KEY || 'your-api-key-here';

export const apiClient = {
    headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
    }
};
EOF
    fi
    
    # 构建生产版本
    if [ "$DEPLOY_ENV" = "production" ]; then
        print_status "构建生产版本..."
        npm run build
        print_status "前端构建完成"
        print_status "输出目录: $FRONTEND_DIR/dist"
    else
        print_status "跳过前端构建 (开发模式)"
    fi
}

# ============= 开发模式 =============
run_dev() {
    echo -e "\n${YELLOW}💻 启动开发模式...${NC}"
    
    # 启动后端
    (
        cd "$BACKEND_DIR"
        source venv/bin/activate
        uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ) &
    BACKEND_PID=$!
    
    # 启动前端
    (
        cd "$FRONTEND_DIR"
        npm run dev
    ) &
    FRONTEND_PID=$!
    
    print_status "后端 (PID: $BACKEND_PID): http://localhost:8000"
    print_status "前端 (PID: $FRONTEND_PID): http://localhost:5173"
    print_status "按 Ctrl+C 停止服务"
    
    # 等待中断信号
    trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
    wait
}

# ============= 测试 =============
test_deployment() {
    echo -e "\n${YELLOW}🧪 测试部署...${NC}"
    
    # 测试后端
    print_status "测试后端 API..."
    if curl -s http://localhost:8000/docs > /dev/null; then
        print_status "后端 API 运行正常"
    else
        print_error "后端 API 无法访问"
        return 1
    fi
    
    # 测试前端
    print_status "测试前端应用..."
    if curl -s http://localhost > /dev/null; then
        print_status "前端应用运行正常"
    else
        print_error "前端应用无法访问"
        return 1
    fi
    
    print_status "所有测试通过！"
}

# ============= 清理 =============
cleanup() {
    echo -e "\n${YELLOW}🧹 清理...${NC}"
    
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
    
    print_status "清理完成"
}

# ============= 主程序 =============
main() {
    case "$DEPLOY_ENV" in
        production)
            check_prerequisites
            deploy_backend
            deploy_frontend
            print_status ""
            print_status "✨ 生产部署完成！"
            print_status "后端服务位置: $BACKEND_DIR"
            print_status "前端应用位置: $FRONTEND_DIR/dist"
            echo ""
            print_warning "后续步骤:"
            echo "  1. 修改 .env 中的 SECRET_API_KEY"
            echo "  2. 部署 Systemd 服务 (参考 DEPLOYMENT.md)"
            ;;
        dev)
            check_prerequisites
            deploy_backend
            deploy_frontend
            run_dev
            ;;
        *)
            print_error "未知的部署模式: $DEPLOY_ENV"
            echo "用法: bash deploy.sh [production|dev]"
            exit 1
            ;;
    esac
}

# 开始部署
main "$@"
