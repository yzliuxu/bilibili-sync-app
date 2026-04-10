import time
import os
import sys
import subprocess
import traceback
import re
import logging
from pathlib import Path
import yt_dlp
from sqlalchemy.orm import Session

# ==============================================================================
# 1. 架构级硬编码配置 (彻底抛弃 .env，直接物理锚定)
# ==============================================================================

import main
BASE_DIR = main.BASE_DIR
DATABASE_URL = main.DATABASE_URL
RCLONE_EXECUTABLE_PATH = main.RCLONE_EXECUTABLE_PATH
RCLONE_CONFIG_PATH = main.RCLONE_CONFIG_PATH
RCLONE_REMOTE_NAME = main.RCLONE_REMOTE_NAME

# 强制切换当前进程的工作目录，杜绝一切相对路径引发的血案
os.chdir(BASE_DIR)




LOG_FILE_PATH = "/www/wwwroot/bilibili-sync-app/backend/worker_engine.log"

# 配置日志引擎，强制无缓冲双路输出
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE_PATH, encoding='utf-8'), # 第一路：实时落盘物理文件
        logging.StreamHandler(sys.stdout)                     # 第二路：实时推送到宝塔/Supervisor 日志面板
    ]
)
logger = logging.getLogger("WorkerEngine")

logger.info("====== Worker 独立引擎进程启动，硬编码与日志总线已挂载 ======")

# ==============================================================================
# 3. 延迟加载数据库模块 
# ==============================================================================
try:
    from database import SessionLocal
    import models
    logger.info("SQLite 数据库模块挂载成功。")
except Exception as e:
    logger.error(f"数据库模块挂载致命失败: {str(e)}")
    sys.exit(1)

# ================= 业务目录配置区域 =================
# "/www/wwwroot/bilibili-sync-app/backend"
DATA_DIR = BASE_DIR / "data"
YT_COOKIES_PATH = DATA_DIR / "yt_cookies.txt"
TEMP_DIR = DATA_DIR / "temp_downloads"

# 确保基础目录在物理磁盘上绝对存在
DATA_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
# ============================================

def get_yt_dlp_options(task: models.Task, target_dir: str):
    if YT_COOKIES_PATH.exists():
        logger.info(f"[{task.id}] 检测到 YouTube Cookie 文件，下载选项将启用 Cookie 支持。")
    else:
        logger.info(f"[{task.id}] 未找到 YouTube Cookie 文件，下载选项将以匿名模式执行，可能无法下载受限内容。")
    FFMPEG_PATH = os.getenv("FFMPEG_BINARY_PATH", "ffmpeg")
    opts = {
        'FFMPEG_LOCATION': FFMPEG_PATH,
        'outtmpl': f'{target_dir}/%(title)s_%(id)s.%(ext)s',
        'cookiefile': str(YT_COOKIES_PATH) if YT_COOKIES_PATH.exists() else None,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['all'],
        'getcomments': True,
        'writeinfojson': True,
        'quiet': True,
        'no_warnings': True,
    }
    if task.video_uploaded:
        opts['skip_download'] = True
    return opts

def check_local_files(target_dir: str, task: models.Task):
    if not os.path.exists(target_dir): return
    for f in os.listdir(target_dir):
        if f.endswith(('.mp4', '.webm', '.mkv')): task.video_downloaded = True
        elif f.endswith(('.vtt', '.ass', '.srt')): task.danmaku_downloaded = True
        elif f.endswith('.info.json'): task.comment_downloaded = True

def process_task(task: models.Task, db: Session):
    logger.info(f">>> [调度器] 开始处理任务 ID [{task.id}]: {task.url}")
    
    try:
        ydl_meta_opts = {
            'cookiefile': str(YT_COOKIES_PATH) if YT_COOKIES_PATH.exists() else None,
            'extract_flat': True, 
            'quiet': True
        }
        with yt_dlp.YoutubeDL(ydl_meta_opts) as ydl:
            info = ydl.extract_info(task.url, download=False)
            task.video_id = info.get('id', str(int(time.time())))
            task.title = info.get('title', 'Unknown Title')
            
            raw_uploader = info.get('uploader') or info.get('channel') or '未分类UP主'
            task.uploader = re.sub(r'[\\/:*?"<>|]', '_', raw_uploader).strip()
            db.commit()
            logger.info(f"[{task.id}] 元数据解析完成: UP主={task.uploader}, 标题={task.title}")
    except Exception as e:
        task.status = "failed"
        task.error_msg = f"解析失败: {str(e)}"
        db.commit()
        logger.error(f"[{task.id}] 解析阶段发生异常: {str(e)}")
        return

    target_dir = str(TEMP_DIR / task.video_id)
    os.makedirs(target_dir, exist_ok=True)

    task.status = "downloading"
    task.error_msg = None
    db.commit()
    logger.info(f"[{task.id}] 状态切换为: 下载中...")
    
    download_error = None
    try:
        last_update = time.time()
        def yt_dlp_hook(d):
            nonlocal last_update
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate')
                if total and total > 0:
                    pct = int(d.get('downloaded_bytes', 0) / total * 100)
                    now = time.time()
                    if now - last_update > 2.0 or pct >= 100:
                        task.progress = pct
                        db.commit()
                        logger.info(f"[{task.id}] 下载进度: {pct}%")
                        last_update = now

        opts = get_yt_dlp_options(task, target_dir)
        opts['progress_hooks'] = [yt_dlp_hook]

        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([task.url])
            logger.info(f"[{task.id}] 本地文件下载流程执行完毕。")
    except Exception as e:
        download_error = str(e)
        logger.error(f"[{task.id}] 下载层级抛出异常: {download_error}")

    check_local_files(target_dir, task)
    db.commit()

    if not task.video_downloaded and not task.video_uploaded:
        task.status = "failed"
        task.error_msg = download_error or "视频未下载"
        db.commit()
        logger.error(f"[{task.id}] 校验失败：未检测到有效视频文件，任务终止。")
        return

    task.status = "uploading"
    db.commit()
    logger.info(f"[{task.id}] 准备触发 Rclone，目标节点: [{RCLONE_REMOTE_NAME}/{task.uploader}]")

    try:
        rclone_setting = db.query(models.Setting).filter(models.Setting.key == "rclone_cookie").first()
        if not rclone_setting or not rclone_setting.value:
            raise Exception("未找到 115 网盘配置！请先在系统配置页面保存 Cookie。")
        
        # 实时生成 Rclone 配置文件
        with open(RCLONE_CONFIG_PATH, "w", encoding="utf-8") as f:
            f.write(rclone_setting.value)

        remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}"
        logger.info(f"[{task.id}] 正在执行搬运与销毁指令...")
        
        result = subprocess.run(
            [
                RCLONE_EXECUTABLE_PATH, "move", target_dir, remote_path, 
                "--config", RCLONE_CONFIG_PATH, 
                "--delete-empty-src-dirs"
            ],
            capture_output=True, text=True
        )

        if result.returncode != 0: 
            raise Exception(result.stderr)
        
        logger.info(f"[{task.id}] Rclone 搬运成功，本地残留已被即时清理。")
        
        if task.video_downloaded: task.video_uploaded = True
        if task.danmaku_downloaded: task.danmaku_uploaded = True
        if task.comment_downloaded: task.comment_uploaded = True
        
        task.video_downloaded = False
        task.danmaku_downloaded = False
        task.comment_downloaded = False

        if download_error:
            task.status = "partial_completed"
            task.error_msg = f"视频上云, 但附件缺失: {download_error}"
            logger.warning(f"[{task.id}] 任务部分完成（附件有缺失）。")
        else:
            task.status = "completed"
            task.error_msg = None
            logger.info(f"[{task.id}] 任务完美完成！生命周期闭环。")
            
    except Exception as e:
        task.status = "failed"
        task.error_msg = f"Rclone失败: {str(e)}"
        logger.error(f"[{task.id}] Rclone 搬运阶段崩溃: {str(e)}")
    
    db.commit()

def run_worker():
    logger.info("=========================================")
    logger.info(" Worker 主循环启动！正在执行幽灵状态回收...")
    
    # 状态机自我修复逻辑
    repair_db = SessionLocal()
    try:
        orphaned_tasks = repair_db.query(models.Task).filter(
            models.Task.status.in_(["downloading", "uploading"])
        ).all()
        for t in orphaned_tasks:
            t.status = "pending"
            t.error_msg = "检测到服务意外中断，任务已重置入队列"
            # 还原之前的进度标志
            t.video_downloaded = False
            t.danmaku_downloaded = False
            t.comment_downloaded = False
        if orphaned_tasks:
            repair_db.commit()
            logger.info(f" 已将 {len(orphaned_tasks)} 个卡死任务重置为等待状态 (Crash Recovery)。")
    except Exception as e:
        logger.error(f" 状态修复彻底失败: {e}")
    finally:
        repair_db.close()

    logger.info(" Worker 进入深度监听轮询中...")
    logger.info("=========================================")
    
    while True:
        db = SessionLocal()
        try:
            task = db.query(models.Task).filter(models.Task.status == "pending").first()
            if task: 
                 process_task(task, db)
            else: 
                 time.sleep(5)
        except Exception as e:
            logger.error(f"Worker 主引擎发生全局 Error:\n{traceback.format_exc()}")
            # 严重错误时务必 rollback，防止会话对象被污染导致后续查询全崩
            db.rollback()
            time.sleep(5)
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()