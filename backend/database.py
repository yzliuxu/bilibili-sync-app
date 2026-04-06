import sys
from pathlib import Path
from sqlalchemy import create_engine, event
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
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}?timeout=5"

# 创建数据库引擎 (check_same_thread=False 是 FastAPI + SQLite 并发写入必须的)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
# 核心魔法：拦截数据库连接事件，强制开启 WAL 模式
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")     # 开启读写并发
    cursor.execute("PRAGMA synchronous=NORMAL")   # 降低磁盘 I/O 刷盘频率，提升几十倍写入性能
    cursor.execute("PRAGMA temp_store=MEMORY")    # 临时表保存在内存中，保护你的 25G 硬盘寿命
    cursor.close()
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