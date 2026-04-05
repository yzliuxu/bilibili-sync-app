#!/bin/bash

# 服务器依赖检查脚本

set -e

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

echo "=========================================="
echo "  服务器依赖检查"
echo "=========================================="
echo ""

MISSING=()

# 检查 systemd
print_info "检查 systemd..."
if command -v systemctl &> /dev/null; then
    print_status "systemd 已安装"
else
    print_error "systemd 未安装（Linux 系统应该自带）"
    MISSING+=("systemd")
fi
echo ""

# 检查 curl
print_info "检查 curl..."
if command -v curl &> /dev/null; then
    print_status "curl 已安装"
else
    print_error "curl 未安装（用于测试，可选）"
fi
echo ""

# 检查 rclone
print_info "检查 rclone..."
if command -v rclone &> /dev/null; then
    print_status "rclone 已安装: $(rclone version | head -1)"
else
    print_error "rclone 未安装（需要您的第三方修改版）"
    MISSING+=("rclone")
fi
echo ""

# 检查 Python（可选）
print_info "检查 Python..."
if command -v python3 &> /dev/null; then
    print_status "Python3 已安装: $(python3 --version)"
else
    print_info "Python3 未安装（可选，某些 PyInstaller 编译的文件可能需要）"
fi
echo ""

# 检查磁盘空间
print_info "检查磁盘空间..."
DISK_AVAILABLE=$(df /opt 2>/dev/null | awk 'NR==2 {print $4/1024/1024 " GB"}' || echo "未知")
print_status "可用空间: $DISK_AVAILABLE（建议 > 1GB）"
echo ""

# 总结
echo "=========================================="
if [ ${#MISSING[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ 所有必要依赖已安装${NC}"
else
    echo -e "${YELLOW}⚠ 缺少以下依赖：${NC}"
    for dep in "${MISSING[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "安装缺失的依赖:"
    echo ""
    echo "  # Ubuntu/Debian"
    echo "  sudo apt update"
    echo ""
    echo "  # 上传您的 rclone 可执行文件"
    echo "  scp /path/to/your/rclone root@server:/usr/local/bin/"
    echo "  sudo chmod +x /usr/local/bin/rclone"
fi
echo "=========================================="
