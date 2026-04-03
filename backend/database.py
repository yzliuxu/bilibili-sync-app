from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# 数据库文件保存在 data 目录下
SQLALCHEMY_DATABASE_URL = "sqlite:///./data/app.db"

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