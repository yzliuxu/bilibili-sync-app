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

# ================= 环境与路径初始化 =================
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

os.chdir(BASE_DIR)
load_dotenv(BASE_DIR / ".env")

from database import SessionLocal
import models

# ================= 配置区域 =================
RCLONE_EXECUTABLE = os.getenv("RCLONE_EXECUTABLE_PATH", "/usr/bin/rclone")
RCLONE_REMOTE = os.getenv("RCLONE_REMOTE", "115:/yt_downloads") # 增加容错
DATA_DIR = BASE_DIR / "data"
RCLONE_CONF_PATH = DATA_DIR / "rclone.conf"
YT_COOKIES_PATH = DATA_DIR / "yt_cookies.txt"
TEMP_DIR = DATA_DIR / "temp_downloads"

DATA_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

# ================= 核心业务逻辑 =================

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
        
        # ========== 极限网络防御（防卡死核心） ==========
        'socket_timeout': 15,      # 15秒无响应立即掐断，防止 socket 无限期挂起
        'retries': 3,              # 失败后最多重试 3 次
        'fragment_retries': 3,     # m4s 分片下载失败重试 3 次
        'http_headers': {          # 伪装正常浏览器，大幅降低 B站 连接重置拦截率
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
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
    
    # ================= 第一阶段：智能元数据解析与合集拆分 =================
    try:
        ydl_meta_opts = {
            'cookiefile': str(YT_COOKIES_PATH) if YT_COOKIES_PATH.exists() else None,
            'extract_flat': 'in_playlist', # 【核心魔法】：遇到合集时，不要下载，只提取扁平列表
            'quiet': True,
            'socket_timeout': 15,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }
        with yt_dlp.YoutubeDL(ydl_meta_opts) as ydl:
            info = ydl.extract_info(task.url, download=False)
            
            # 【原子化拆分拦截】：如果是 UP主主页或播放列表，立刻进行拆分，打散成独立任务
            if 'entries' in info or info.get('_type') == 'playlist':
                entries = info.get('entries', [])
                added_count = 0
                for entry in entries:
                    if not entry: continue
                    # 提取子视频的 URL
                    entry_url = entry.get('url') or entry.get('webpage_url')
                    if entry_url:
                        # 防错：B站有时返回短链，需补全为绝对路径
                        if not entry_url.startswith('http'):
                            entry_url = f"https://www.bilibili.com/video/{entry_url}"
                            
                        # 数据库去重：避免重复添加已经存在的视频任务
                        exists = db.query(models.Task).filter(models.Task.url == entry_url).first()
                        if not exists:
                            new_task = models.Task(url=entry_url)
                            db.add(new_task)
                            added_count += 1
                            
                # 功成身退：把当前的“父级巨无霸任务”立刻标记为已完成
                task.status = "completed"
                task.title = info.get('title', 'UP主合集 / 播放列表')
                task.progress = 100
                task.error_msg = f"【合集解析成功】自动拆分为 {added_count} 个独立单集排队下载"
                db.commit()
                return # 终止当前处理，让 Worker 下一轮循环去逐个拿拆分出来的单集子任务！

            # === 如果只是一般单视频，继续走标准流程 ===
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

    # ================= 第二阶段：实体单视频安全下载 =================
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
        task.error_msg = f"网络超时中断: {download_error}" if download_error else "视频未落地磁盘"
        db.commit()
        return

    # ================= 第三阶段：Rclone 即刻上云与销毁 =================
    task.status = "uploading"
    db.commit()
    print(f"[{task.id}] 正在上云至 [{task.uploader}]...")
    
    try:
        rclone_setting = db.query(models.Setting).filter(models.Setting.key == "rclone_cookie").first()
        if not rclone_setting or not rclone_setting.value:
            raise Exception("未找到 115 网盘配置！")
            
        with open(RCLONE_CONF_PATH, "w", encoding="utf-8") as f:
            f.write(rclone_setting.value)
            
        remote_path = f"{RCLONE_REMOTE}/{task.uploader}"
        result = subprocess.run(
            [
                RCLONE_EXECUTABLE, "move", target_dir, remote_path, 
                "--config", str(RCLONE_CONF_PATH), 
                "--delete-empty-src-dirs",
                "--transfers", "4" # 多并发线程加快附件与主视频的共同上传速度
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
            task.error_msg = f"主体上云,但附件缺失: {download_error}"
        else:
            task.status = "completed"
            task.error_msg = None
            task.progress = 100
            
    except Exception as e:
        task.status = "failed"
        task.error_msg = f"Rclone失败: {str(e)}"
    
    db.commit()

def run_worker():
    print("=========================================")
    print(" Worker 启动！执行幽灵状态回收...")
    
    repair_db = SessionLocal()
    try:
        orphaned_tasks = repair_db.query(models.Task).filter(
            models.Task.status.in_(["downloading", "uploading"])
        ).all()
        for t in orphaned_tasks:
            t.status = "pending"
            t.error_msg = "检测到服务意外中断，任务已重置入队列"
        if orphaned_tasks:
            repair_db.commit()
            print(f" 已将 {len(orphaned_tasks)} 个卡死任务重置。")
    except Exception as e:
        pass
    finally:
        repair_db.close()

    print(" 监听任务中...")
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
            db.rollback()
            time.sleep(5)
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()