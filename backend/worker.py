import time
import os
import sys
import subprocess
import traceback
import re
import logging
from pathlib import Path
import yt_dlp
import urllib.request
from sqlalchemy.orm import Session

import main

BASE_DIR = main.BASE_DIR
DATABASE_URL = main.DATABASE_URL
RCLONE_EXECUTABLE_PATH = main.RCLONE_EXECUTABLE_PATH
RCLONE_CONFIG_PATH = main.RCLONE_CONFIG_PATH
RCLONE_REMOTE_NAME = main.RCLONE_REMOTE_NAME

# 切换当前进程的工作目录
os.chdir(BASE_DIR)


LOG_FILE_PATH = "/www/wwwroot/bilibili-sync-app/backend/worker_engine.log"

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(
            LOG_FILE_PATH, encoding="utf-8"
        ),  # 第一路：实时落盘物理文件
        logging.StreamHandler(sys.stdout),  # 第二路：实时推送到宝塔/Supervisor 日志面板
    ],
)
logger = logging.getLogger("WorkerEngine")

logger.info("====== Worker 引擎启动 ======")

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

# 确保基础目录在物理磁盘上存在
DATA_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)


# ============================================
def notify_server():
    """向主进程发送更新信号，采用极短超时防止阻塞下载流"""
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/api/internal/notify-tasks", method="POST"
        )
        api_key = os.getenv("SECRET_API_KEY")
        if api_key:
            req.add_header("X-API-Key", api_key)
        urllib.request.urlopen(req, timeout=0.5)
    except Exception as e:
        logger.error(f"通知主进程失败: {e}")
        pass  # 无论主进程是否死掉，绝不能影响 worker 自身的下载进程


def get_yt_dlp_options(task: models.Task, target_dir: str):
    if YT_COOKIES_PATH.exists():
        logger.info(
            f"[{task.id}] 检测到 Bilibili Cookies 文件，下载选项将启用 Cookies 支持。"
        )
    else:
        logger.info(
            f"[{task.id}] 未找到 Bilibili Cookies 文件，下载选项将以匿名模式执行，可能无法下载受限内容。"
        )
    # FFMPEG_BINARY_PATH 环境变量允许用户指定自定义的 ffmpeg 可执行文件路径，增强兼容性和性能。如果未设置，则默认使用系统环境中的 ffmpeg。
    FFMPEG_PATH = os.getenv("FFMPEG_BINARY_PATH", "ffmpeg")
    opts = {
        "FFMPEG_LOCATION": FFMPEG_PATH,
        "outtmpl": f"{target_dir}/%(title)s_%(id)s.%(ext)s",
        "cookiefile": str(YT_COOKIES_PATH) if YT_COOKIES_PATH.exists() else None,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["all"],
        "getcomments": True,
        "writeinfojson": True,
        "quiet": True,
        "no_warnings": True,
    }
    if task.video_uploaded:
        opts["skip_download"] = True
    return opts


def check_local_files(target_dir: str, task: models.Task):
    if not os.path.exists(target_dir):
        return
    for f in os.listdir(target_dir):
        if f.endswith((".mp4", ".webm", ".mkv")):
            task.video_downloaded = True
        elif f.endswith((".vtt", ".ass", ".srt")):
            task.danmaku_downloaded = True
        elif f.endswith(".info.json"):
            task.comment_downloaded = True


def process_task(task: models.Task, db: Session):
    print(f"\n>>> 开始处理任务 [{task.id}]: {task.url}")

    try:
        # 1. 预解析元数据 (使用 extract_flat 快速获取列表结构)
        ydl_meta_opts = {
            "cookiefile": str(YT_COOKIES_PATH) if YT_COOKIES_PATH.exists() else None,
            "extract_flat": True,  # 核心：只取列表，不取具体视频流
            "quiet": True,
            "ignoreerrors": True,
        }
        with yt_dlp.YoutubeDL(ydl_meta_opts) as ydl: # type: ignore
            info = ydl.extract_info(task.url, download=False)

            # === 核心逻辑：处理合集/播放列表/UP主主页 ===
            # 如果发现 entries 字段且类型是 playlist，说明是一个合集
            if "entries" in info and info.get("_type") == "playlist":
                entries = list(info["entries"])

                raw_playlist_title = info.get("title", "未知合集")
                safe_playlist_title=re.sub(r'[\\/:*?"<>|]', "_", raw_playlist_title).strip()

                print(
                    f"[{task.id}] 检测到合集/列表，[{safe_playlist_title}]，包含 {len(entries)} 个视频..."
                )

                for entry in entries:
                    if not entry:
                        continue
                    # 获取该条目的具体 URL
                    entry_url = entry.get("url") or entry.get("webpage_url")
                    if not entry_url and entry.get("id"):
                        entry_url = f"https://www.bilibili.com/video/{entry['id']}"

                    if not entry_url:
                        continue

                    # 检查是否已存在（避免合集内视频重复添加）
                    exists = (
                        db.query(models.Task)
                        .filter(models.Task.url == entry_url)
                        .first()
                    )
                    if not exists:
                        new_task = models.Task(
                            url=entry_url,
                            title=entry.get("title", "等待解析..."),
                            uploader=info.get("uploader")
                            or info.get("title")
                            or "未分类",
                            playlist_name=safe_playlist_title,
                        )
                        db.add(new_task)

                # 将原始的“合集任务”标记为已完成（已展开）
                task.status = "completed"
                task.title = f"[已展开合集] {info.get('title', '未知名称')}"
                task.progress = 100
                db.commit()
                notify_server()
                print(f"[{task.id}] 合集已成功拆分为独立任务。")
                return  # 结束当前合集任务的处理，转向下一个独立视频任务

            # === 如果是单视频，继续原有逻辑 ===
            task.video_id = info.get("id", str(int(time.time())))
            task.title = info.get("title", "Unknown Title")

            raw_uploader = info.get("uploader") or info.get("channel") or "未分类UP主"
            task.uploader = re.sub(r'[\\/:*?"<>|]', "_", raw_uploader).strip()
            db.commit()
            notify_server()

    except Exception as e:
        task.status = "failed"
        task.error_msg = f"解析失败: {str(e)}"
        db.commit()
        notify_server()
        return

    # 以Up主的名字为子目录进行下载，确保不同UP主的视频文件不会混淆在一起

    if task.playlist_name:
        # 合集视频放在 UP 主目录下的合集子目录里
        target_dir = str(TEMP_DIR / task.uploader / task.playlist_name)
        remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}/{task.playlist_name}"
    else:
        # 单视频直接放在 UP 主目录下
        target_dir = str(TEMP_DIR / task.uploader)
        os.makedirs(target_dir, exist_ok=True)

    task.status = "downloading"
    task.error_msg = None
    db.commit()
    notify_server()
    logger.info(f"[{task.id}] 状态切换为: 下载中...")

    download_error = None
    try:
        last_update = time.time()

        def yt_dlp_hook(d):
            nonlocal last_update

            # 状态 1：正在下载
            if d["status"] == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                if total and total > 0:
                    pct = int(d.get("downloaded_bytes", 0) / total * 100)

                    # 核心逻辑：只要还在 downloading 状态，进度最高只给到 99%
                    display_pct = min(pct, 99)

                    now = time.time()
                    # 节流更新：每秒更新一次，或者当状态有跳跃时
                    if now - last_update > 1.0:
                        task.progress = display_pct
                        db.commit()
                        notify_server()
                        # 日志可选择不输出每一秒的进度，避免刷屏，或者保留
                        last_update = now

            # 状态 2：单文件下载彻底完成
            elif d["status"] == "finished":
                # 只有收到明确的 finished 信号，才将进度推至 100%
                task.progress = 100
                db.commit()
                notify_server()
                logger.info(f"[{task.id}] 当前文件下载完成 (100%)")

        opts = get_yt_dlp_options(task, target_dir)
        opts["progress_hooks"] = [yt_dlp_hook]

        with yt_dlp.YoutubeDL(opts) as ydl: # type: ignore
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
        notify_server()
        logger.error(f"[{task.id}] 校验失败：未检测到有效视频文件，任务终止。")
        return

    task.status = "uploading"
    db.commit()
    notify_server()
    logger.info(
        f"[{task.id}] 准备触发 Rclone，目标节点: [{RCLONE_REMOTE_NAME}/{task.uploader}]"
    )

    try:
        rclone_setting = (
            db.query(models.Setting)
            .filter(models.Setting.key == "rclone_cookie")
            .first()
        )
        if not rclone_setting or not rclone_setting.value:
            raise Exception("未找到 115 网盘配置！请先在系统配置页面保存 Cookie。")

        # 实时生成 Rclone 配置文件
        with open(RCLONE_CONFIG_PATH, "w", encoding="utf-8") as f:
            f.write(rclone_setting.value)

        remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}"
        logger.info(f"[{task.id}] 正在执行搬运与销毁指令...")

        result = subprocess.run(
            [
                RCLONE_EXECUTABLE_PATH,
                "move",
                target_dir,
                remote_path,
                "--config",
                RCLONE_CONFIG_PATH,
                "--delete-empty-src-dirs",
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise Exception(result.stderr)

        logger.info(f"[{task.id}] Rclone 搬运成功，本地残留已被即时清理。")

        if task.video_downloaded:
            task.video_uploaded = True
        if task.danmaku_downloaded:
            task.danmaku_uploaded = True
        if task.comment_downloaded:
            task.comment_uploaded = True

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
    notify_server()


def run_worker():
    logger.info("=========================================")
    logger.info(" Worker 主循环启动！正在执行幽灵状态回收...")

    # 状态机自我修复逻辑
    repair_db = SessionLocal()
    try:
        orphaned_tasks = (
            repair_db.query(models.Task)
            .filter(models.Task.status.in_(["downloading", "uploading"]))
            .all()
        )
        for t in orphaned_tasks:
            t.status = "pending"
            t.error_msg = "检测到服务意外中断，任务已重置入队列"
            # 还原之前的进度标志
            t.video_downloaded = False
            t.danmaku_downloaded = False
            t.comment_downloaded = False
        if orphaned_tasks:
            repair_db.commit()
            logger.info(
                f" 已将 {len(orphaned_tasks)} 个卡死任务重置为等待状态 (Crash Recovery)。"
            )
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
