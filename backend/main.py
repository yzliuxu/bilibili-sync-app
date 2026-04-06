import sys
import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import uvicorn
from dotenv import load_dotenv

# ================= 核心路径与环境解析 =================
# 确保在 PyInstaller 打包环境中也能准确定位可执行文件所在目录
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

# 强行切换工作目录，防范 nohup 启动时的路径漂移
os.chdir(BASE_DIR)

# 加载 .env 环境变量
load_dotenv(BASE_DIR / ".env")

# 确保数据目录存在
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# 加载环境变量后，再导入数据库模型，防止底层引发相对路径错误
from database import engine, get_db
import models
import schemas

# 启动时自动创建数据库表
models.Base.metadata.create_all(bind=engine)

# ================= 鉴权配置 =================
# 动态从 .env 读取密钥，如果没填才降级为 123456
SECRET_API_KEY = os.getenv("SECRET_API_KEY", "123456")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)

def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != SECRET_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的 API Key")

app = FastAPI(title="Bilibili Sync API")

# 精准的 CORS 正则，匹配 Tailscale 和本地开发网段
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https?://(localhost|127\.0\.0\.1|100\.\d+\.\d+\.\d+)(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api", dependencies=[Depends(verify_api_key)])

@api_router.get("/verify")
def verify_token():
    return {"status": "ok", "message": "鉴权成功"}

@api_router.get("/tasks", response_model=List[schemas.TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    """获取所有任务列表"""
    return db.query(models.Task).order_by(models.Task.created_at.desc()).all()

@api_router.post("/tasks", response_model=schemas.TaskResponse)
def create_task(task_in: schemas.TaskCreate, db: Session = Depends(get_db)):
    """添加新任务"""
    existing_task = db.query(models.Task).filter(models.Task.url == task_in.url).first()
    if existing_task:
        return existing_task

    new_task = models.Task(url=task_in.url)
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@api_router.post("/tasks/{task_id}/retry")
def retry_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.status = "pending"
    task.error_msg = None
    db.commit()
    return {"message": "任务已重新放入队列"}

@api_router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """删除任务记录"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        db.delete(task)
        db.commit()
    return {"message": "记录已删除"}

@api_router.get("/settings")
def get_all_settings(db: Session = Depends(get_db)):
    """获取当前所有配置 (用于前端初始化显示)"""
    settings = db.query(models.Setting).all()
    return {s.key: s.value for s in settings}

@api_router.post("/settings")
def update_setting(setting_in: schemas.SettingUpdate, db: Session = Depends(get_db)):
    """更新或保存配置 (yt-dlp 或 rclone cookie)"""
    db_setting = db.query(models.Setting).filter(models.Setting.key == setting_in.key).first()
    if db_setting:
        db_setting.value = setting_in.value
    else:
        db_setting = models.Setting(key=setting_in.key, value=setting_in.value)
        db.add(db_setting)
    db.commit()

    # 修复：使用 DATA_DIR 绝对路径写入，防止找不到目录报错
    if setting_in.key == "yt_cookie":
        yt_path = DATA_DIR / "yt_cookies.txt"
        with open(yt_path, "w", encoding="utf-8") as f:
            f.write(setting_in.value)
    return {"message": "配置已更新"}

app.include_router(api_router)

@app.get("/health")
def health():
    return {"status": "ok"}

def get_frontend_dist() -> Optional[Path]:
    # 兼容打包环境与源码环境的前端目录寻找逻辑
    candidate = BASE_DIR / "frontend" / "dist"
    if candidate.exists():
        return candidate

    candidate = BASE_DIR / "dist"
    if candidate.exists():
        return candidate

    return None

frontend_dist = get_frontend_dist()
if frontend_dist is not None:
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    print("Warning: Frontend dist folder not found!")

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    
    # 修复：从环境变量提取 Tailscale IP 绑定。默认 127.0.0.1 防御公网探测
    LISTEN_HOST = os.getenv("LISTEN_HOST", "127.0.0.1")
    LISTEN_PORT = int(os.getenv("LISTEN_PORT", "8000"))
    
    print(f"Server binding to Tailscale IP: {LISTEN_HOST}:{LISTEN_PORT}")
    uvicorn.run(app, host=LISTEN_HOST, port=LISTEN_PORT)