from fastapi import FastAPI, Depends, HTTPException, status, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from sqlalchemy.orm import Session
from typing import List

from database import engine, get_db
import models
import schemas

# 启动时自动创建数据库表
models.Base.metadata.create_all(bind=engine)

# ================= 鉴权配置 =================
SECRET_API_KEY = "123456" # 请修改为你的专属复杂密码！

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)

def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != SECRET_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的 API Key")
# ============================================

app = FastAPI(title="Bilibili Sync API", dependencies=[Depends(verify_api_key)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中建议设置为前端的具体 IP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/verify")
def verify_token():
    return {"status": "ok", "message": "鉴权成功"}

@app.get("/api/tasks", response_model=List[schemas.TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    """获取所有任务列表"""
    return db.query(models.Task).order_by(models.Task.created_at.desc()).all()

@app.post("/api/tasks", response_model=schemas.TaskResponse)
def create_task(task_in: schemas.TaskCreate, db: Session = Depends(get_db)):
    """添加新任务"""
    # 检查是否已经存在相同 URL 的任务
    existing_task = db.query(models.Task).filter(models.Task.url == task_in.url).first()
    if existing_task:
        return existing_task
    
    new_task = models.Task(url=task_in.url)
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@app.post("/api/tasks/{task_id}/retry")
def retry_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 将状态设回 pending，worker 会自动重新扫描并处理
    task.status = "pending"
    task.error_msg = None
    db.commit()
    return {"message": "任务已重新放入队列"}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """删除任务记录"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        db.delete(task)
        db.commit()
    return {"message": "记录已删除"}

# --- 2. 系统配置接口 ---

@app.get("/api/settings")
def get_all_settings(db: Session = Depends(get_db)):
    """获取当前所有配置 (用于前端初始化显示)"""
    settings = db.query(models.Setting).all()
    return {s.key: s.value for s in settings}

@app.post("/api/settings")
def update_setting(setting_in: schemas.SettingUpdate, db: Session = Depends(get_db)):
    """更新或保存配置 (yt-dlp 或 rclone cookie)"""
    db_setting = db.query(models.Setting).filter(models.Setting.key == setting_in.key).first()
    if db_setting:
        db_setting.value = setting_in.value
    else:
        db_setting = models.Setting(key=setting_in.key, value=setting_in.value)
        db.add(db_setting)
    db.commit()
    
    # 特殊逻辑：如果是更新 yt_cookie，我们需要同步写入本地 data/yt_cookies.txt 供 yt-dlp 读取
    if setting_in.key == "yt_cookie":
        with open("data/yt_cookies.txt", "w") as f:
            f.write(setting_in.value)
    return {"message": "配置已更新"}