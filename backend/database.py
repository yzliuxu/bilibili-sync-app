import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# 动态计算程序的绝对物理路径 (兼容 PyInstaller 打包脱壳运行)
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

# 确保数据目录绝对存在
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# 组合出绝对安全的 SQLite 连接路径
DB_PATH = DATA_DIR / "app.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# 创建数据库引擎 (check_same_thread=False 是 FastAPI + SQLite 并发写入必须的)
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