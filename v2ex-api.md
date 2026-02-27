# V2EX API 文档

## 概述

V2EX API 用于学术、应用或扩展开发，反对用于填充商业或个人网站内容。API 接口 URI 和字段名保持稳定，不会变更。

## 速率限制

- **默认限制**：每个 IP 每小时 120 次请求
- **响应头**：
  - `X-Rate-Limit-Limit` - 总配额
  - `X-Rate-Limit-Reset` - 重置时间
  - `X-Rate-Limit-Remaining` - 剩余配额

> 注：可被 CDN 缓存的请求仅在首次消耗配额。

---

## API 端点

### 1. 最热主题

获取首页右侧的 10 大最热内容。

```
GET /api/topics/hot.json
```

**认证**：无需
**参数**：无

---

### 2. 最新主题

获取首页"全部"标签下的最新内容。

```
GET /api/topics/latest.json
```

**认证**：无需
**参数**：无

---

### 3. 节点信息

获取指定节点的详细信息。

```
GET /api/nodes/show.json
```

**认证**：无需

**参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 节点英文名（如 `python`） |

**示例**：
```
GET /api/nodes/show.json?name=python
```

---

### 4. 用户信息

获取指定用户的主页信息。

```
GET /api/members/show.json
```

**认证**：无需

**参数**（二选一）：
| 参数 | 类型 | 说明 |
|------|------|------|
| `username` | string | 用户名（如 `Livid`） |
| `id` | string | 用户 ID（如 `1`） |

**示例**：
```
GET /api/members/show.json?username=Livid
GET /api/members/show.json?id=1
```

---

## 通用说明

- 所有端点均使用 `GET` 方法
- 返回格式：`JSON`
- 基础域名：`https://www.v2ex.com`
