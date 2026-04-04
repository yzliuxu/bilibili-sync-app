import time
import os
import subprocess
import traceback
import re
import yt_dlp
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from dotenv import dotenv_values

# ================= 配置区域 =================
# rclone 可执行文件路径：只从 .env 配置文件读取
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
config = dotenv_values(ENV_PATH)
RCLONE_EXECUTABLE = config.get("RCLONE_EXECUTABLE_PATH") or "/usr/bin/rclone"

# 注意：这里改成了 "115:"，因为前端生成的配置节点头部是 [115]
RCLONE_REMOTE = "115:/yt_downloads"
RCLONE_CONF_PATH = "data/rclone.conf"
# ============================================

def get_yt_dlp_options(task: models.Task, target_dir: str):
    opts = {
        'outtmpl': f'{target_dir}/%(title)s_%(id)s.%(ext)s',
        'cookiefile': 'data/yt_cookies.txt' if os.path.exists('data/yt_cookies.txt') else None,
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
    
    # --- 第 1 步：解析视频元数据 ---
    try:
        ydl_meta_opts = {
            'cookiefile': 'data/yt_cookies.txt' if os.path.exists('data/yt_cookies.txt') else None,
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

    target_dir = f"data/temp_downloads/{task.video_id}"
    os.makedirs(target_dir, exist_ok=True)

    # --- 第 2 步：下载视频与附件 ---
    task.status = "downloading"
    task.error_msg = None
    db.commit()
    
    download_error = None
    try:
        # 【新增逻辑】：定义进度回调函数
        last_update = time.time()
        def yt_dlp_hook(d):
            nonlocal last_update
            if d['status'] == 'downloading':
                # 尝试获取总大小或预估总大小
                total = d.get('total_bytes') or d.get('total_bytes_estimate')
                if total and total > 0:
                    pct = int(d.get('downloaded_bytes', 0) / total * 100)
                    now = time.time()
                    # 【核心技巧：节流】每隔 2 秒才向数据库写一次，防止锁死 SQLite
                    if now - last_update > 2.0 or pct >= 100:
                        task.progress = pct
                        db.commit()
                        last_update = now

        opts = get_yt_dlp_options(task, target_dir)
        opts['progress_hooks'] = [yt_dlp_hook] # 将监听器挂载给 yt-dlp

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

    # --- 第 3 步：动态生成 Rclone 配置并上传 ---
    task.status = "uploading"
    db.commit()
    print(f"[{task.id}] 正在准备 Rclone 配置并上传至 [{task.uploader}] 目录...")

    try:
        # 【核心新增】：从数据库拉取前端保存的 rclone 配置，并写入临时文件
        rclone_setting = db.query(models.Setting).filter(models.Setting.key == "rclone_cookie").first()
        if not rclone_setting or not rclone_setting.value:
            raise Exception("未找到 115 网盘配置！请先在系统配置页面保存 Cookie。")
        
        with open(RCLONE_CONF_PATH, "w") as f:
            f.write(rclone_setting.value)

        # 执行 rclone move，并强行指定 --config 参数指向我们刚生成的配置文件
        remote_path = f"{RCLONE_REMOTE}/{task.uploader}"
        result = subprocess.run(
            [
                RCLONE_EXECUTABLE, "move", target_dir, remote_path, 
                "--config", RCLONE_CONF_PATH, 
                "--delete-empty-src-dirs"
            ],
            capture_output=True, text=True
        )

        if result.returncode != 0: 
            raise Exception(result.stderr)
        
        # 上传成功，更新状态
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
    os.makedirs("data/temp_downloads", exist_ok=True)
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