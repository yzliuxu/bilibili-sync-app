from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from database import Base
import datetime


class Task(Base):
    __tablename__ = "tasks"

    # id = Column(Integer, primary_key=True, index=True)
    # video_id = Column(String, unique=True, index=True)
    # url = Column(String, nullable=False)
    # title = Column(String, nullable=True)
    # uploader = Column(String, nullable=True, default="未分类") # UP主名称

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    video_id: Mapped[str | None] = mapped_column(String, unique=True, index=True)
    url: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    uploader: Mapped[str] = mapped_column(
        String, nullable=True, default="未分类"
    )  # UP主名称

    # playlist_name = Column(String, nullable=True) # 所属合集名称
    playlist_name: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # 所属合集名称

    # 总体状态
    # status = Column(String, default="pending")
    # progress = Column(Integer, default=0) # <--- 新增：记录 0-100 的下载百分比
    status: Mapped[str] = mapped_column(String, default="pending")
    progress: Mapped[int] = mapped_column(
        Integer, default=0
    )  # <--- 新增：记录 0-100 的下载百分比
    # 本地组件状态
    # video_downloaded = Column(Boolean, default=False)
    # danmaku_downloaded = Column(Boolean, default=False)
    # comment_downloaded = Column(Boolean, default=False)
    video_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)
    danmaku_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)
    comment_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)

    # 云端组件状态
    # video_uploaded = Column(Boolean, default=False)
    # danmaku_uploaded = Column(Boolean, default=False)
    # comment_uploaded = Column(Boolean, default=False)
    video_uploaded: Mapped[bool] = mapped_column(Boolean, default=False)
    danmaku_uploaded: Mapped[bool] = mapped_column(Boolean, default=False)
    comment_uploaded: Mapped[bool] = mapped_column(Boolean, default=False)

    # error_msg = Column(Text, nullable=True)
    # created_at = Column(DateTime, default=datetime.datetime.utcnow)
    # updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )


class Setting(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String, unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
