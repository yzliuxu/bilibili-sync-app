import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# ================= 路径绝对化防漂移 =================
# 动态计算无论在哪里启动程序，都能准确找到 data 目录的位置
if getattr(os, "frozen", False) and hasattr(os, "sys"):
    # 如果是 PyInstaller 打包后的二进制文件
    BASE_DIR = Path(os.sys.executable).resolve().parent
else:
    # 如果是源码运行
    BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True) # 启动时强行确保目录存在

DB_PATH = DATA_DIR / "app.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# 创建数据库引擎 (check_same_thread=False 是 FastAPI + SQLite 必须的)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# 创建数据库会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 所有模型类的基类
Base = declarative_base()

# 依赖注入：在接口调用时获取数据库连接，用完自动关闭
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()