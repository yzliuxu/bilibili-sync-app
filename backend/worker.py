import time
import os
import subprocess
import traceback
import re
import yt_dlp
from sqlalchemy.orm import Session
from database import SessionLocal
import models

# ================= 配置区域 =================
# 你的 rclone 115 网盘远程路径 (请根据你的 rclone.conf 实际节点名称修改，比如 "115:/videos")
RCLONE_REMOTE = "115_drive:/yt_downloads"

def get_yt_dlp_options(task: models.Task, target_dir: str):
    """根据任务当前状态，动态生成 yt-dlp 的配置参数"""
    opts = {
        'outtmpl': f'{target_dir}/%(title)s_%(id)s.%(ext)s',
        'cookiefile': 'data/yt_cookies.txt' if os.path.exists('data/yt_cookies.txt') else None,
        'writesubtitles': True,      # 开启字幕/弹幕
        'writeautomaticsub': True,   # 开启自动生成的字幕
        'subtitleslangs': ['all'],   # 下载所有语言
        'getcomments': True,         # 开启评论抓取
        'writeinfojson': True,       # 必须写入 info.json 才能保存评论
        'quiet': True,
        'no_warnings': True,
    }

    # 【策略 B 核心】：如果视频已经上云了，我们就跳过视频下载，只去抓缺失的弹幕和评论！
    if task.video_uploaded:
        opts['skip_download'] = True
        print(f"[{task.id}] 视频已在云端，本次仅补抓弹幕/评论。")

    return opts

def check_local_files(target_dir: str, task: models.Task):
    if not os.path.exists(target_dir): 
        return
    for f in os.listdir(target_dir):
        if f.endswith(('.mp4', '.webm', '.mkv')): 
            task.video_downloaded = True
        elif f.endswith(('.vtt', '.ass', '.srt')): 
            task.danmaku_downloaded = True
        elif f.endswith('.info.json'): 
            task.comment_downloaded = True

def process_task(task: models.Task, db: Session):
    print(f"\n>>> 处理任务 [{task.id}]: {task.url}")
    
    # --- 第 1 步：解析视频元数据获取 video_id ---
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

    # --- 第 2 步：执行 yt-dlp 下载 ---
    task.status = "downloading"
    task.error_msg = None
    db.commit()
    
    download_error = None
    try:
        opts = get_yt_dlp_options(task, target_dir)
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([task.url])
    except Exception as e:
        # yt-dlp 报错了（比如评论被关了，或者年龄限制）。
        # 但不要急着 return！因为视频可能已经下好了一半，我们要进入策略 B 检查。
        download_error = str(e)
        print(f"[{task.id}] yt-dlp 遇到错误: {download_error}")

    # 检查本地到底下好了什么
    check_local_files(target_dir, task)
    db.commit()

    # 如果连视频都没下好，那就是彻底失败了
    if not task.video_downloaded and not task.video_uploaded:
        task.status = "failed"
        task.error_msg = download_error or "视频未下载"
        db.commit()
        return

    # --- 第 3 步：执行 rclone move 上传 (释放 25G 硬盘的救星) ---
    task.status = "uploading"
    db.commit()
    print(f"[{task.id}] 上传至 [{task.uploader}] 目录...")

    try:
        remote_path = f"{RCLONE_REMOTE}/{task.uploader}"
        result = subprocess.run(
            ["rclone", "move", target_dir, remote_path, "--delete-empty-src-dirs"],
            capture_output=True, text=True
        )

        if result.returncode != 0:
            raise Exception(result.stderr)
        
        # 上传成功，同步状态
        if task.video_downloaded: task.video_uploaded = True
        if task.danmaku_downloaded: task.danmaku_uploaded = True
        if task.comment_downloaded: task.comment_uploaded = True
        
        # 清空本地标志（因为文件被 move 走了）
        task.video_downloaded = False
        task.danmaku_downloaded = False
        task.comment_downloaded = False

        # --- 第 4 步：最终状态判定 ---
        if download_error:
            # 说明有缺失附件
            task.status = "partial_completed"
            task.error_msg = f"视频上云, 附件缺失: {download_error}"
        else:
            task.status = "completed"
            task.error_msg = None
            
        print(f"[{task.id}] 处理完毕。最终状态: {task.status}")

    except Exception as e:
        task.status = "failed"
        task.error_msg = f"Rclone 上传失败: {str(e)}"
        print(f"[{task.id}] 上传报错: {str(e)}")
    
    db.commit()

def run_worker():
    """主循环：不断轮询数据库寻找新任务"""
    print("=========================================")
    print(" Worker 启动成功！正在监听 pending 任务...")
    print("=========================================")
    
    # 确保临时目录存在
    os.makedirs("data/temp_downloads", exist_ok=True)
    while True:
        db = SessionLocal()
        try:
            task = db.query(models.Task).filter(models.Task.status == "pending").first()
            if task: process_task(task, db)
            else: time.sleep(5)
        except Exception as e:
            print(f"Worker 崩溃捕获: {traceback.format_exc()}")
            time.sleep(5)
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()