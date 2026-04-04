from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# 前端发来添加任务的请求格式
class TaskCreate(BaseModel):
    url: str

# 后端返回给前端的任务列表格式
class TaskResponse(BaseModel):
    id: int
    video_id: Optional[str] = None
    url: str
    title: Optional[str] = None
    uploader: Optional[str] = "未分类"
    status: str
    progress: int = 0
    
    # 细分状态也传给前端，以后可以在页面上做更详细的展示
    video_downloaded: bool
    danmaku_downloaded: bool
    comment_downloaded: bool
    video_uploaded: bool
    danmaku_uploaded: bool
    comment_uploaded: bool

    error_msg: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# 前端发来更新 Cookie 的请求格式
class SettingUpdate(BaseModel):
    key: str
    value: str