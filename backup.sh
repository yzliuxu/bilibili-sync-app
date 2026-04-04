#!/bin/bash

# Bilibili Sync App - 备份与恢复脚本
# 用法: bash backup.sh [backup|restore] [path]

set -e

# ========== 配置 ==========
PROJECT_PATH="/var/www/bilibili-sync-app"
BACKUP_BASE_DIR="/backup/bilibili-sync"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ========== 颜色定义 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========== 日志函数 ==========
log_info() {
    echo -e "${GREEN}ℹ${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_debug() {
    echo -e "${BLUE}→${NC} $1"
}

# ========== 备份函数 ==========
backup() {
    log_info "开始备份..."
    
    # 创建备份目录
    mkdir -p "$BACKUP_BASE_DIR"
    
    BACKUP_FILE="$BACKUP_BASE_DIR/backup_$TIMESTAMP.tar.gz"
    
    log_debug "停止应用服务..."
    sudo systemctl stop bilibili-sync-api || true
    
    # 备份数据库和配置文件
    log_debug "正在压缩数据..."
    tar --exclude='__pycache__' \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='*.pyc' \
        -czf "$BACKUP_FILE" \
        -C "$(dirname "$PROJECT_PATH")" \
        "$(basename "$PROJECT_PATH")/data" \
        "$(basename "$PROJECT_PATH")/.env" \
        "$(basename "$PROJECT_PATH")/logs" \
        2>/dev/null || true
    
    if [ -f "$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_info "备份成功: $BACKUP_FILE ($BACKUP_SIZE)"
        
        # 计算 SHA256 校验和
        CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
        echo "$CHECKSUM $BACKUP_FILE" > "$BACKUP_FILE.sha256"
        log_debug "校验和: $CHECKSUM"
    else
        log_error "备份文件创建失败"
        return 1
    fi
    
    # 清理过期备份
    cleanup_old_backups
    
    # 重启服务
    log_debug "重启应用服务..."
    sudo systemctl start bilibili-sync-api || true
    
    log_info "备份完成！"
}

# ========== 恢复函数 ==========
restore() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "请指定备份文件"
        list_backups
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "备份文件不存在: $backup_file"
        return 1
    fi
    
    # 验证校验和
    if [ -f "$backup_file.sha256" ]; then
        log_debug "验证备份文件完整性..."
        if ! sha256sum -c "$backup_file.sha256" > /dev/null 2>&1; then
            log_error "备份文件校验和不匹配，可能已损坏"
            return 1
        fi
        log_info "备份文件完整性验证通过"
    fi
    
    log_warn "开始恢复备份..." 
    log_warn "这将覆盖现有的数据文件和配置"
    
    read -p "确认恢复? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "恢复已取消"
        return 1
    fi
    
    # 停止服务
    log_debug "停止应用服务..."
    sudo systemctl stop bilibili-sync-api || true
    
    # 创建恢复前的紧急备份
    log_debug "创建紧急备份..."
    EMERGENCY_BACKUP="$BACKUP_BASE_DIR/emergency_backup_$TIMESTAMP.tar.gz"
    tar -czf "$EMERGENCY_BACKUP" \
        -C "$(dirname "$PROJECT_PATH")" \
        "$(basename "$PROJECT_PATH")/data" \
        2>/dev/null || true
    
    # 恢复文件
    log_debug "正在提取文件..."
    tar -xzf "$backup_file" \
        -C "$(dirname "$PROJECT_PATH")" \
        --strip-components=0 \
        2>/dev/null || true
    
    # 恢复权限
    log_debug "修复文件权限..."
    sudo chown -R www-data:www-data "$PROJECT_PATH" || true
    sudo chmod -R 755 "$PROJECT_PATH" || true
    
    # 重启服务
    log_debug "重启应用服务..."
    sudo systemctl start bilibili-sync-api
    
    log_info "恢复成功！"
    log_debug "紧急备份已保存至: $EMERGENCY_BACKUP"
}

# ========== 清理过期备份 ==========
cleanup_old_backups() {
    log_debug "清理超过 $RETENTION_DAYS 天的旧备份..."
    
    local count=$(find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS | wc -l)
    
    if [ $count -gt 0 ]; then
        find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
        find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz.sha256" -mtime +$RETENTION_DAYS -delete
        log_info "已删除 $count 个过期备份"
    fi
}

# ========== 列出备份 ==========
list_backups() {
    echo -e "\n${BLUE}📦 可用的备份文件：${NC}\n"
    
    if [ ! -d "$BACKUP_BASE_DIR" ]; then
        log_warn "备份目录不存在"
        return
    fi
    
    count=0
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            count=$((count + 1))
            size=$(du -h "$file" | cut -f1)
            echo "$count. $file ($size)"
        fi
    done < <(find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -type f | sort -r | head -20)
    
    if [ $count -eq 0 ]; then
        log_warn "未找到备份文件"
    fi
}

# ========== 查看备份统计 ==========
stats() {
    echo -e "\n${BLUE}📊 备份统计信息：${NC}\n"
    
    if [ ! -d "$BACKUP_BASE_DIR" ]; then
        log_warn "备份目录不存在"
        return
    fi
    
    local total_backups=$(find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -type f | wc -l)
    local total_size=$(du -sh "$BACKUP_BASE_DIR" | cut -f1)
    local oldest=$(find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | head -1 | cut -d' ' -f2-)
    local newest=$(find "$BACKUP_BASE_DIR" -name "backup_*.tar.gz" -type f -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)
    
    echo "总备份数: $total_backups"
    echo "总占用空间: $total_size"
    [ -n "$oldest" ] && echo "最早备份: $oldest"
    [ -n "$newest" ] && echo "最新备份: $newest"
    echo "保留天数: $RETENTION_DAYS 天"
}

# ========== 验证备份 ==========
verify() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "请指定备份文件"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "备份文件不存在: $backup_file"
        return 1
    fi
    
    log_info "验证备份文件..."
    
    # 校验和验证
    if [ -f "$backup_file.sha256" ]; then
        if sha256sum -c "$backup_file.sha256" > /dev/null 2>&1; then
            log_info "完整性检查: ✓ 通过"
        else
            log_error "完整性检查: ✗ 失败"
            return 1
        fi
    fi
    
    # 压缩包完整性
    if tar -tzf "$backup_file" > /dev/null 2>&1; then
        log_info "压缩包完整性: ✓ 通过"
    else
        log_error "压缩包完整性: ✗ 失败"
        return 1
    fi
    
    # 列出备份内容
    log_info "备份内容预览:"
    tar -tzf "$backup_file" | head -20
    
    log_info "验证完成"
}

# ========== 帮助信息 ==========
show_help() {
    cat << EOF
用法: bash backup.sh <命令> [选项]

命令:
  backup                     执行备份
  restore <backup_file>      恢复备份
  list                       列出所有备份
  stats                      显示备份统计
  verify <backup_file>       验证备份完整性
  cleanup                    清理过期备份
  help                       显示此帮助

示例:
  bash backup.sh backup
  bash backup.sh list
  bash backup.sh restore /backup/bilibili-sync/backup_20240101_120000.tar.gz
  bash backup.sh verify /backup/bilibili-sync/backup_20240101_120000.tar.gz

配置:
  备份目录: $BACKUP_BASE_DIR
  项目路径: $PROJECT_PATH
  保留天数: $RETENTION_DAYS

EOF
}

# ========== 主程序 ==========
main() {
    case "${1:-help}" in
        backup)
            backup
            ;;
        restore)
            restore "$2"
            ;;
        list)
            list_backups
            ;;
        stats)
            stats
            ;;
        verify)
            verify "$2"
            ;;
        cleanup)
            cleanup_old_backups
            ;;
        *)
            show_help
            ;;
    esac
}

# 执行主程序
main "$@"
