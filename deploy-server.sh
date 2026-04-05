#!/bin/bash

# Bilibili Sync App - 服务器部署脚本
# 在服务器上解压编译包后运行此脚本

set -e

APP_DIR="/opt/bilibili-sync-app"
FRONTEND_DIR="/var/www/bilibili-sync-app/frontend"

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

# ========== 检查权限 ==========
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        print_error "此脚本需要 root 权限"
        exit 1
    fi
    print_status "权限检查通过"
}

# ========== 创建目录 ==========
create_directories() {
    print_info "创建应用目录..."
    
    mkdir -p "$APP_DIR"
    mkdir -p "$APP_DIR/data"
    mkdir -p "$APP_DIR/logs"
    mkdir -p "$FRONTEND_DIR"
    
    # 设置权限
    chown -R www-data:www-data "$APP_DIR"
    chown -R www-data:www-data "$FRONTEND_DIR"
    chmod 755 "$APP_DIR"
    
    print_status "目录已创建"
}

# ========== 检查 .env ==========
check_env() {
    print_info "检查环境配置..."
    
    if [ ! -f "$APP_DIR/.env" ]; then
        print_error ".env 文件不存在"
        echo "请在 $APP_DIR 目录下创建 .env 文件"
        echo "参考: $APP_DIR/.env.example"
        exit 1
    fi
    
    # 验证必要变量
    source "$APP_DIR/.env"
    
    if [ -z "$SECRET_API_KEY" ]; then
        print_error "SECRET_API_KEY 未设置"
        exit 1
    fi
    
    if [ -z "$RCLONE_EXECUTABLE_PATH" ]; then
        print_error "RCLONE_EXECUTABLE_PATH 未设置"
        exit 1
    fi
    
    print_status ".env 配置正确"
}

# ========== 部署后端 ==========
deploy_backend() {
    print_info "部署后端..."
    
    if [ ! -f "$APP_DIR/bilibili-sync-api" ]; then
        print_error "bilibili-sync-api 可执行文件不存在"
        exit 1
    fi
    
    chmod +x "$APP_DIR/bilibili-sync-api"
    chown www-data:www-data "$APP_DIR/bilibili-sync-api"
    
    # 测试可执行文件
    if ! "$APP_DIR/bilibili-sync-api" --help &>/dev/null; then
        print_error "bilibili-sync-api 可执行文件无法运行"
        exit 1
    fi
    
    print_status "后端部署完成"
}

# ========== 部署前端 ==========
deploy_frontend() {
    print_info "部署前端..."
    
    if [ ! -d "$APP_DIR/dist" ]; then
        print_error "前端 dist 目录不存在"
        exit 1
    fi
    
    cp -r "$APP_DIR/dist"/* "$FRONTEND_DIR/"
    chown -R www-data:www-data "$FRONTEND_DIR"
    
    print_status "前端部署完成"
}

# ========== 部署 Systemd 服务 ==========
deploy_systemd() {
    print_info "部署 Systemd 服务..."
    
    if [ ! -f "$APP_DIR/bilibili-sync-api.service" ]; then
        print_error "服务文件不存在"
        exit 1
    fi
    
    cp "$APP_DIR/bilibili-sync-api.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable bilibili-sync-api
    
    print_status "Systemd 服务已注册"
}

# ========== 启动服务 ==========
start_service() {
    echo ""
    print_info "启动服务..."
    
    systemctl start bilibili-sync-api
    
    # 等待服务启动
    sleep 2
    
    if systemctl is-active --quiet bilibili-sync-api; then
        print_status "服务已启动"
        systemctl status bilibili-sync-api --no-pager
    else
        print_error "服务启动失败，查看日志:"
        systemctl status bilibili-sync-api --no-pager
        journalctl -u bilibili-sync-api -n 20 --no-pager
        exit 1
    fi
}

# ========== 验证部署 ==========
verify_deployment() {
    echo ""
    print_info "验证部署..."
    
    # 检查后端
    if curl -s -f http://127.0.0.1:8000/health > /dev/null; then
        print_status "后端 API 正常"
    else
        print_error "后端 API 无法访问"
        return 1
    fi
    
    # 检查前端（由后端服务）
    if curl -s http://127.0.0.1:8000 > /dev/null; then
        print_status "前端应用正常"
    else
        print_info "前端应用未配置"
    fi
}

# ========== 主流程 ==========
main() {
    echo "=========================================="
    echo "  Bilibili Sync App - 服务器部署"
    echo "=========================================="
    echo ""
    
    check_sudo
    create_directories
    check_env
    deploy_backend
    deploy_frontend
    deploy_systemd
    start_service
    verify_deployment
    
    echo ""
    echo -e "${GREEN}========== 部署完成 ==========${NC}"
    echo ""
    echo "后续管理命令:"
    echo "  查看状态: systemctl status bilibili-sync-api"
    echo "  查看日志: journalctl -u bilibili-sync-api -f"
    echo "  停止服务: systemctl stop bilibili-sync-api"
    echo "  重启服务: systemctl restart bilibili-sync-api"
}

main "$@"
