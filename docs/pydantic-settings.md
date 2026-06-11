# Pydantic Settings 专项

> 配置管理 — 环境变量 / .env / 类型校验

---

## 目录

- [1. 基础用法](#1-基础用法)
- [2. 字段类型支持](#2-字段类型支持)
- [3. .env 文件映射规则](#3-env-文件映射规则)
- [4. 本项目的完整配置](#4-本项目的完整配置)
- [5. 最佳实践](#5-最佳实践)

---

## 1. 基础用法

### 1.1 安装

```bash
pip install pydantic-settings
```

### 1.2 定义配置类

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 每个属性 = 一个可配置项
    deepseek_api_key: str = ""
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": ".env",           # 自动加载 .env 文件
        "env_file_encoding": "utf-8", # 文件编码
        "case_sensitive": False,      # 环境变量名大小写不敏感
        "extra": "ignore",            # 忽略未定义的变量
    }

settings = Settings()
```

### 1.3 使用

```python
print(settings.deepseek_api_key)  # 自动从 .env 读取
print(settings.port)               # 8000（默认值）
```

### 1.4 值的读取优先级

```
环境变量 (export DEEPSEEK_API_KEY=xxx)  ← 最高
    ↓
.env 文件 (DEEPSEEK_API_KEY=xxx)
    ↓
代码中的默认值 (str = "")                ← 最低
```

---

## 2. 字段类型支持

```python
class Settings(BaseSettings):
    # 基本类型
    name: str = "default"
    port: int = 8000
    debug: bool = False
    temperature: float = 0.0

    # 列表（.env 中使用 JSON 格式）
    cors_origins: list[str] = ["http://localhost:3000"]
    # .env: CORS_ORIGINS=["http://localhost:3000","https://example.com"]

    # 路径
    vectorstore_dir: str = str(Path(__file__).parent / "data" / "vectorstore")
```

---

## 3. .env 文件映射规则

### 3.1 命名转换

`.env` 中的 `UPPER_CASE` → Python 中的 `lower_case` 或 `snake_case`（开启 `case_sensitive: False`）：

```
.env 文件                     →  Python 属性
DEEPSEEK_API_KEY=sk-xxx      →  settings.deepseek_api_key
OLLAMA_BASE_URL=http://...   →  settings.ollama_base_url
MAX_REWRITE_ATTEMPTS=3       →  settings.max_rewrite_attempts
```

### 3.2 .env 示例文件

```env
# LLM
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TEMPERATURE=0.0
DEEPSEEK_MAX_TOKENS=4096

# Embedding
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=bge-m3

# 向量库
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K_RETRIEVAL=5
MAX_REWRITE_ATTEMPTS=2
MAX_SEARCH_QUERIES=3

# 服务
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 4. 本项目的完整配置

```python
# config.py
from pathlib import Path
from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    # LLM
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_temperature: float = 0.0
    deepseek_max_tokens: int = 4096

    # Embedding
    embedding_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "bge-m3"
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model_name: str = ""

    # 向量库
    vectorstore_dir: str = str(BACKEND_DIR / "data" / "vectorstore")
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # 研究员
    max_rewrite_attempts: int = 2
    top_k_retrieval: int = 5
    max_search_queries: int = 3

    # HITL
    checkpointer_db_path: str = str(BACKEND_DIR / "data" / "checkpoints.db")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": str(BACKEND_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }

settings = Settings()
```

### 配置项分类

| 类别 | 配置项 | 默认值 |
|------|--------|--------|
| LLM | `deepseek_api_key`, `deepseek_model`, `deepseek_temperature` | — |
| Embedding | `embedding_provider`, `ollama_embedding_model` | ollama / bge-m3 |
| 向量库 | `chunk_size`, `chunk_overlap`, `top_k_retrieval` | 1000 / 200 / 5 |
| 研究员 | `max_rewrite_attempts`, `max_search_queries` | 2 / 3 |
| 服务 | `host`, `port`, `cors_origins` | 0.0.0.0 / 8000 / localhost:3000 |

---

## 5. 最佳实践

### 5.1 区分默认值与敏感值

```python
# 敏感值：默认空字符串，强制用户配置
deepseek_api_key: str = ""

# 非敏感值：提供合理默认值，可选覆盖
chunk_size: int = 1000
```

### 5.2 路径使用 Path 对象

```python
# 好：跨平台兼容，相对于模块位置计算
vectorstore_dir: str = str(Path(__file__).parent / "data" / "vectorstore")

# 差：硬编码路径，跨环境不可移植
vectorstore_dir: str = "/home/user/data/vectorstore"
```

### 5.3 启动时确保目录存在

```python
# config.py 末尾
settings = Settings()

# 确保运行时目录存在
os.makedirs(settings.vectorstore_dir, exist_ok=True)
os.makedirs(os.path.dirname(settings.checkpointer_db_path), exist_ok=True)
```

### 5.4 .env.example 模板

始终提供 `.env.example`，列出所有需要的配置项和占位值：

```env
# 复制此文件为 .env 并填入真实值
DEEPSEEK_API_KEY=sk-your-api-key-here
# ...
```

### 5.5 安全：不要提交 .env

```gitignore
# .gitignore
.env
.env.local
.env.*.local
```

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [config.py](../backend/config.py) | 完整 Settings 类定义 |
| [.env.example](../backend/.env.example) | 环境变量模板 |

## 延伸资源

- [Pydantic Settings 文档](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [Python-dotenv](https://github.com/theskumar/python-dotenv)