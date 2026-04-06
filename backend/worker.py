import time
import os
import sys
import subprocess
import traceback
import re
from pathlib import Path
import yt_dlp
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# 确保 PyInstaller 运行路径正确
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

# 强行切换工作区
os.chdir(BASE_DIR)
load_dotenv(BASE_DIR / ".env")

# 必须在这里引入 database 和 models (在切换目录并加载 env 之后)
from database import SessionLocal
import models

# ================= 配置区域 =================
RCLONE_EXECUTABLE = os.getenv("RCLONE_EXECUTABLE_PATH", "/usr/bin/rclone")
RCLONE_REMOTE = "115:/yt_downloads"
DATA_DIR = BASE_DIR / "data"
RCLONE_CONF_PATH = DATA_DIR / "rclone.conf"
YT_COOKIES_PATH = DATA_DIR / "yt_cookies.txt"
TEMP_DIR = DATA_DIR / "temp_downloads"

# 确保基础目录存在
DATA_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
# ============================================

def get_yt_dlp_options(task: models.Task, target_dir: str):
    opts = {
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
    print(f"\n>>> 开始处理任务 [{task.id}]: {task.url}")
    
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
    except Exception as e:
        task.status = "failed"
        task.error_msg = f"解析失败: {str(e)}"
        db.commit()
        return

    target_dir = str(TEMP_DIR / task.video_id)
    os.makedirs(target_dir, exist_ok=True)

    task.status = "downloading"
    task.error_msg = None
    db.commit()
    
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
                        last_update = now

        opts = get_yt_dlp_options(task, target_dir)
        opts['progress_hooks'] = [yt_dlp_hook]

        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([task.url])
    except Exception as e:
        download_error = str(e)

    check_local_files(target_dir, task)
    db.commit()

    if not task.video_downloaded and not task.video_uploaded:
        task.status = "failed"
        task.error_msg = download_error or "视频未下载"
        db.commit()
        return

    task.status = "uploading"
    db.commit()
    print(f"[{task.id}] 正在准备 Rclone 配置并上传至 [{task.uploader}] 目录...")

    try:
        rclone_setting = db.query(models.Setting).filter(models.Setting.key == "rclone_cookie").first()
        if not rclone_setting or not rclone_setting.value:
            raise Exception("未找到 115 网盘配置！请先在系统配置页面保存 Cookie。")
        
        with open(RCLONE_CONF_PATH, "w", encoding="utf-8") as f:
            f.write(rclone_setting.value)

        remote_path = f"{RCLONE_REMOTE}/{task.uploader}"
        result = subprocess.run(
            [
                RCLONE_EXECUTABLE, "move", target_dir, remote_path, 
                "--config", str(RCLONE_CONF_PATH), 
                "--delete-empty-src-dirs"
            ],
            capture_output=True, text=True
        )

        if result.returncode != 0: 
            raise Exception(result.stderr)
        
        if task.video_downloaded: task.video_uploaded = True
        if task.danmaku_downloaded: task.danmaku_uploaded = True
        if task.comment_downloaded: task.comment_uploaded = True
        
        task.video_downloaded = False
        task.danmaku_downloaded = False
        task.comment_downloaded = False

        if download_error:
            task.status = "partial_completed"
            task.error_msg = f"视频上云, 但附件缺失: {download_error}"
        else:
            task.status = "completed"
            task.error_msg = None
            
    except Exception as e:
        task.status = "failed"
        task.error_msg = f"Rclone失败: {str(e)}"
    
    db.commit()

def run_worker():
    print("=========================================")
    print(" Worker 启动！监听任务中...")
    print("=========================================")
    while True:
        db = SessionLocal()
        try:
            task = db.query(models.Task).filter(models.Task.status == "pending").first()
            if task: 
                process_task(task, db)
            else: 
                time.sleep(5)
        except Exception as e:
            print(f"Worker Error: {traceback.format_exc()}")
            time.sleep(5)
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()