import time
import os
import sys
import subprocess
import traceback
import re
import logging
import shutil
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
    format="[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] - %(message)s",
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
        logger.error(f"通知主进程失败 [{type(e).__name__}]: {e}（非致命，下载主流程不受影响）")
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
    _ffmpeg_env = os.getenv("FFMPEG_BINARY_PATH")
    FFMPEG_PATH = _ffmpeg_env or shutil.which("ffmpeg")
    opts = {
        **({"ffmpeg_location": FFMPEG_PATH} if FFMPEG_PATH else {}),
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
    logger.info(f"[{task.id}] 开始处理任务: {task.url}")

    is_multi_part = False  # 分P视频标记，影响后续目录结构
    task.progress = 0      # 重置进度，防止重试时残留旧值

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

            if info is None:
                raise Exception("yt-dlp 未能提取视频信息（URL 无效、需要 Cookies 登录，或网络不通）")

            # === 核心逻辑：处理合集/播放列表/UP主主页 ===
            if "entries" in info and info.get("_type") == "playlist":
                entries = list(info["entries"])
                raw_playlist_title = info.get("title", "未知合集")
                safe_playlist_title = re.sub(r'[\\/:*?"<>|]', "_", raw_playlist_title).strip() or "未知合集"

                # 判断是分P视频还是真正的列表（合集/UP主主页）
                # 分P视频的特征：提交的是单个 BV 号链接，但 yt-dlp 展开出多个分P条目
                main_bv_match = re.search(r'(BV\w+)', task.url)
                main_bv_id = main_bv_match.group(1) if main_bv_match else None

                if main_bv_id:
                    # === 分P视频：作为整体下载，放入以"视频标题_BV号"命名的子目录 ===
                    is_multi_part = True
                    task.video_id = main_bv_id
                    task.title = info.get("title", task.title or "Unknown Title")
                    raw_uploader = info.get("uploader") or info.get("channel") or "未分类UP主"
                    task.uploader = re.sub(r'[\\/:*?"<>|]', "_", raw_uploader).strip()
                    db.commit()
                    notify_server()
                    logger.info(
                        f"[{task.id}] 检测到分P视频 [{task.title}]，共 {len(entries)} P，整体下载至独立子目录。"
                    )
                else:
                    # === 真正的列表：展开为独立子任务 ===
                    logger.info(
                        f"[{task.id}] 检测到合集/列表，[{safe_playlist_title}]，包含 {len(entries)} 个视频..."
                    )

                    # UP主空间主页（非具体合集页）的子任务不挂 playlist_name，
                    # 避免多一层以频道名命名的无意义目录
                    is_space_page = (
                        'space.bilibili.com' in task.url
                        and 'collectiondetail' not in task.url
                        and 'seriesdetail' not in task.url
                        and '/channel/' not in task.url
                    )

                    for entry in entries:
                        if not entry:
                            continue
                        # 优先使用 webpage_url（完整地址），若不以 http 开头则用 BV 号补全
                        entry_url = entry.get("webpage_url") or entry.get("url")
                        if entry_url and not entry_url.startswith("http"):
                            entry_url = f"https://www.bilibili.com/video/{entry_url}"
                        if not entry_url and entry.get("id"):
                            entry_url = f"https://www.bilibili.com/video/{entry['id']}"
                        if not entry_url:
                            continue

                        exists = (
                            db.query(models.Task)
                            .filter(models.Task.url == entry_url)
                            .first()
                        )
                        if not exists:
                            new_task = models.Task(
                                url=entry_url,
                                title=entry.get("title", "等待解析..."),
                                uploader=info.get("uploader") or info.get("title") or "未分类",
                                playlist_name=None if is_space_page else safe_playlist_title,
                            )
                            db.add(new_task)

                    task.status = "completed"
                    task.title = f"[已展开合集] {info.get('title', '未知名称')}"
                    task.progress = 100
                    db.commit()
                    notify_server()
                    logger.info(f"[{task.id}] 合集已成功拆分为独立任务。")
                    return

            else:
                # === 单视频 ===
                task.video_id = info.get("id", str(int(time.time())))
                task.title = info.get("title", "Unknown Title")
                raw_uploader = info.get("uploader") or info.get("channel") or "未分类UP主"
                task.uploader = re.sub(r'[\\/:*?"<>|]', "_", raw_uploader).strip()
                db.commit()
                notify_server()

    except Exception as e:
        # 如果标题还是占位符，从 URL 中提取 BV 号作为可识别标题
        if not task.title or task.title == "等待解析...":
            bv_match = re.search(r'(BV\w+)', task.url)
            task.title = bv_match.group(1) if bv_match else task.url
        task.status = "failed"
        task.error_msg = f"解析失败: {str(e)}"
        db.commit()
        notify_server()
        return

    # === 计算本地临时目录 ===
    # 规则：
    #   分P视频  → uploader / [playlist_name /] title_BVid /
    #   合集视频 → uploader / playlist_name /
    #   单视频   → uploader /
    safe_video_title = re.sub(r'[\\/:*?"<>|]', "_", task.title).strip() or "未知视频"

    if is_multi_part:
        multi_part_subdir = f"{safe_video_title}_{task.video_id}"
        if task.playlist_name:
            target_dir = str(TEMP_DIR / task.uploader / task.playlist_name / multi_part_subdir)
        else:
            target_dir = str(TEMP_DIR / task.uploader / multi_part_subdir)
    elif task.playlist_name:
        target_dir = str(TEMP_DIR / task.uploader / task.playlist_name)
    else:
        target_dir = str(TEMP_DIR / task.uploader)

    os.makedirs(target_dir, exist_ok=True)

    task.status = "downloading"
    task.error_msg = None
    db.commit()
    notify_server()
    logger.info(f"[{task.id}] 「{task.title}」开始下载，目标目录: {target_dir}")

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
                logger.info(f"[{task.id}] 「{task.title}」当前文件下载完成 (100%)")

        opts = get_yt_dlp_options(task, target_dir)
        opts["progress_hooks"] = [yt_dlp_hook]

        with yt_dlp.YoutubeDL(opts) as ydl: # type: ignore
            ydl.download([task.url])
            logger.info(f"[{task.id}] 「{task.title}」本地文件下载完毕。")
    except Exception as e:
        download_error = str(e)
        logger.error(f"[{task.id}] 「{task.title}」下载异常: {download_error}")

    check_local_files(target_dir, task)
    db.commit()

    if not task.video_downloaded and not task.video_uploaded:
        task.status = "failed"
        task.error_msg = download_error or "视频未下载"
        db.commit()
        notify_server()
        logger.error(f"[{task.id}] 「{task.title}」校验失败：未检测到视频文件，任务终止。")
        return

    task.status = "uploading"
    db.commit()
    notify_server()

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

        if is_multi_part:
            if task.playlist_name:
                remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}/{task.playlist_name}/{multi_part_subdir}"
            else:
                remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}/{multi_part_subdir}"
        elif task.playlist_name:
            remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}/{task.playlist_name}"
        else:
            remote_path = f"{RCLONE_REMOTE_NAME}/{task.uploader}"
        logger.info(f"[{task.id}] 「{task.title}」开始搬运: {target_dir} → {remote_path}")

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
            raise Exception(result.stderr or result.stdout or f"rclone 异常退出，退出码: {result.returncode}")

        logger.info(f"[{task.id}] 「{task.title}」搬运成功 → {remote_path}")

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
            logger.warning(f"[{task.id}] 「{task.title}」部分完成（视频已上云，附件缺失）。")
        else:
            task.status = "completed"
            task.error_msg = None
            logger.info(f"[{task.id}] 「{task.title}」全部完成。")

    except Exception as e:
        task.status = "failed"
        task.error_msg = f"Rclone失败: {str(e)}"
        logger.error(f"[{task.id}] 「{task.title}」Rclone 搬运失败: {str(e)}")

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
