from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from database import Base
import datetime

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, unique=True, index=True)
    url = Column(String, nullable=False)
    title = Column(String, nullable=True)
    uploader = Column(String, nullable=True, default="未分类") # UP主名称
    
    # 总体状态
    status = Column(String, default="pending")

    # 本地组件状态
    video_downloaded = Column(Boolean, default=False)
    danmaku_downloaded = Column(Boolean, default=False)
    comment_downloaded = Column(Boolean, default=False)

    # 云端组件状态
    video_uploaded = Column(Boolean, default=False)
    danmaku_uploaded = Column(Boolean, default=False)
    comment_uploaded = Column(Boolean, default=False)

    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(Text, nullable=False)