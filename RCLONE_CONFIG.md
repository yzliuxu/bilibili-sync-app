# Rclone 配置指南

## 📍 rclone 可执行文件位置配置

### 快速查找 rclone 可执行文件位置

```bash
# 查看 rclone 可执行文件在哪里
which rclone
# 输出类似：/usr/bin/rclone

# 或者
whereis rclone
# 输出类似：rclone: /usr/bin/rclone
```

---

## 🔧 配置方法

### 方法 1: 配置文件

编辑项目根目录中的 `.env` 文件：

```env
# Linux/Mac 标准安装
RCLONE_EXECUTABLE_PATH=/usr/bin/rclone

# 或自定义位置
RCLONE_EXECUTABLE_PATH=/opt/rclone/rclone

# Windows
RCLONE_EXECUTABLE_PATH=C:\Program Files\rclone\rclone.exe
```

> 本项目仅从配置文件读取 Rclone 路径，不使用系统环境变量。

### 方法 2: 直接修改 `worker.py`

如果不想从 `.env` 自动读取，可以直接在代码中设置：

```python
# backend/worker.py
RCLONE_EXECUTABLE = "/usr/local/bin/rclone"  # 硬编码路径
```

---

## 🖥️ 不同系统上的默认安装位置

### Linux (Ubuntu/Debian)
```bash
# 标准安装位置
/usr/bin/rclone

# 或自定义位置（如果从源代码编译）
/usr/local/bin/rclone
```

### Linux (手动安装)
```bash
# 第三方修改版通常放在
/usr/local/bin/rclone
~/bin/rclone
/opt/rclone/rclone
```

### macOS
```bash
# Homebrew 安装位置
/usr/local/bin/rclone 或 /opt/homebrew/bin/rclone
# 位置：/usr/local/bin/rclone 或 /opt/homebrew/bin/rclone

# 检查安装位置
which rclone
```

### Windows
```
C:\Program Files\rclone\rclone.exe
C:\Program Files (x86)\rclone\rclone.exe
```

---

## ✅ 验证配置

### 测试 rclone 是否可访问

```python
# 在 Python 中测试
import subprocess
import os

rclone_path = os.getenv("RCLONE_EXECUTABLE_PATH", "rclone")

try:
    result = subprocess.run([rclone_path, "--version"], 
                          capture_output=True, text=True)
    if result.returncode == 0:
        print("✓ rclone 正常工作")
        print(result.stdout)
    else:
        print("✗ rclone 错误:", result.stderr)
except FileNotFoundError:
    print(f"✗ 无法找到 rclone: {rclone_path}")
```

### 或在命令行测试

```bash
# 测试 rclone 是否可用
/usr/bin/rclone --version

# 查看 rclone 配置
/usr/bin/rclone config show
```

---

## 🚀 使用第三方修改版 rclone

**重要**: 本项目不包含 rclone 的安装说明，因为您使用的是第三方修改版 rclone。

请确保您的 rclone 可执行文件：
1. 已正确安装在系统上
2. 具有执行权限
3. 可以通过 `RCLONE_EXECUTABLE_PATH` 环境变量或系统 PATH 访问

### 验证第三方 rclone 安装
rclone --version
```

---

## 🔍 调试 rclone 路径问题

### 问题：找不到 rclone

**解决方案 1：使用完整路径**
```env
RCLONE_EXECUTABLE_PATH=/usr/bin/rclone
```

**解决方案 2：检查 PATH 环境变量**
```bash
echo $PATH
# 应该包含 rclone 所在的目录
```

**解决方案 3：创建符号链接**
```bash
# 创建链接指向系统 PATH
sudo ln -s /custom/path/to/rclone /usr/local/bin/rclone
```

---

## 📝 测试脚本

创建 `test_rclone.py` 检查配置：

```python
#!/usr/bin/env python3
import os
import subprocess
import sys

def test_rclone():
    """测试 rclone 配置是否正确"""
    
    # 读取环境变量
    rclone_path = os.getenv("RCLONE_EXECUTABLE_PATH", "rclone")
    print(f"📍 Rclone 可执行文件路径: {rclone_path}")
    
    # 检查文件是否存在
    if rclone_path != "rclone" and not os.path.exists(rclone_path):
        print(f"❌ 文件不存在: {rclone_path}")
        return False
    
    # 测试版本命令
    try:
        result = subprocess.run([rclone_path, "--version"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ Rclone 正常工作")
            print(result.stdout)
            return True
        else:
            print(f"❌ Rclone 错误: {result.stderr}")
            return False
    except FileNotFoundError:
        print(f"❌ 无法执行: {rclone_path}")
        return False
    except subprocess.TimeoutExpired:
        print(f"❌ Rclone 命令超时")
        return False

if __name__ == "__main__":
    success = test_rclone()
    sys.exit(0 if success else 1)
```

运行测试：
```bash
cd backend
python test_rclone.py
```

---

## 常见错误及解决方案

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `FileNotFoundError` | 路径不正确 | 检查 RCLONE_EXECUTABLE_PATH |
| `Permission denied` | 无执行权限 | `chmod +x /path/to/rclone` |
| `Command not found` | rclone 未安装 | 安装 rclone |
| `Connection refused` | 网络问题 | 检查网络和 rclone 配置 |

---

## 优化建议

1. **使用绝对路径**：避免依赖系统 PATH 变化
   ```env
   RCLONE_EXECUTABLE_PATH=/usr/bin/rclone
   ```

2. **CI/CD 中**：设置环境变量
   ```yaml
   env:
     RCLONE_EXECUTABLE_PATH: /usr/bin/rclone
   ```

3. **权限管理**：确保运行用户有执行权限
   ```bash
   sudo chown www-data:www-data /usr/bin/rclone
   sudo chmod 755 /usr/bin/rclone
   ```

---

## 相关文件位置

- **配置文件**: 在 `worker.py` 第 12-19 行
- **环境变量**: 在 `.env` 文件中设置
- **服务配置**: `bilibili-sync-api.service` 中的 `Environment` 字段
