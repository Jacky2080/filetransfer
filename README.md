# File Transfer

基于 Next.js 15 + 阿里云 OSS 的个人文件交换平台，支持多房间隔离、
归档恢复、拖拽上传、在线搜索和 AI 聊天。

## 功能

- **文件上传**：拖拽或选择文件上传至 OSS，大于 100MB 自动分片上传
- **文件下载**：单选直接下载，多选通过 FC 后端打包为 zip
- **归档恢复**：OSS 冷归档文件自动发起恢复，轮询完成后下载
- **多房间**：自定义房间名，独立 OSS 前缀和密码，互不可见
- **搜索**：按文件名搜索，支持正则表达式和键盘导航
- **管理面板**：删除/重命名文件、创建房间、重复检测、流量日志
- **DeepSeek AI**：嵌入 DeepSeek 聊天界面
- **安全保障**：STS 临时凭证、JWT 认证、middleware 房间隔离、IP 白名单

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | [Next.js 15](https://nextjs.org/) (App Router) |
| 存储 | [阿里云 OSS](https://www.aliyun.com/product/oss) |
| 认证 | [阿里云访问控制 RAM STS 临时凭证](https://www.aliyun.com/product/ram) + JWT (RS256) |
| 后端函数 | [阿里云函数计算 FC](https://www.aliyun.com/product/fc) (Express) |
| 压缩 | [Archiver.js](https://www.archiverjs.com/) |
| AI | [OpenAI SDK](https://github.com/openai/openai-node) (兼容 DeepSeek) |

## 项目结构

```text
├── app/                     # Next.js App Router
│   ├── page.tsx             # 登录页 (/)
│   ├── layout.tsx           # 根布局
│   ├── authenticate.ts      # 登录鉴权 Server Action
│   ├── auth/route.ts        # STS 临时凭证 API
│   ├── middleware.ts         # JWT 验证 + 路由守卫 + IP 白名单
│   ├── success/
│   │   ├── page.tsx         # Main 房间文件传输
│   │   └── admin/           # 管理面板
│   ├── rooms/[roomName]/
│   │   ├── page.tsx         # 自定义房间文件传输
│   │   └── delete/page.tsx  # 房间文件删除
│   ├── deepseek/            # DeepSeek AI 聊天
│   └── fail/                # 登录失败页
├── components/              # 共享组件
│   ├── FileTransfer.tsx     # 核心文件传输组件
│   ├── DropArea.tsx         # 拖拽上传
│   ├── Search.tsx           # 文件搜索
│   ├── DeleteForm.tsx       # 删除表单（含重命名）
│   ├── useAuth.ts           # 认证 Hook
│   ├── getFileList.ts       # 文件列表获取
│   ├── styles.css           # 统一样式
│   └── types.ts             # 类型定义
├── src/
│   ├── jwt.ts               # JWT 签名/验证
│   └── file-transfer-fc.js  # FC 后端（zip/download/create/oper）
├── backend/                 # FC 后端本地开发文件
├── public/                  # 静态资源
├── private.pem / public.pem # RSA 密钥对
└── next.config.ts
```

## 快速开始

### 1. 环境准备

```bash
git clone https://github.com/euphronx/filetransfer.git
cd filetransfer
npm install
```

### 2. 生成 RSA 密钥对

```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in private.pem -out public.pem
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
# 服务配置
PORT=3000
HOST=::

# RSA 密钥（base64 编码）
PRIVATE_KEY=<cat private.pem | base64>
PUBLIC_KEY=<cat public.pem | base64>

# 阿里云 RAM 访问控制（前往 RAM 控制台创建用户和角色）
# 获取路径：RAM 用户 → [创建用户](https://ram.console.aliyun.com/users) → 创建 AccessKey
OSS_ACCESS_KEY_ID=<your_access_key_id>
OSS_ACCESS_KEY_SECRET=<your_access_key_secret>
# RAM 角色 ARN（创建 STS 角色后可在详情页复制）
OSS_ROLE_ARN=<acs:ram::xxx:role/xxx>
# STS 临时凭证有效期（秒）
OSS_TOKEN_EXPIRE_TIME=3600

# 登录密码（Main 房间）
PASSWORD=<your_password>
# 管理员页面密码
SUPER_PWD=<your_super_password>
# FC 后端 PBKDF2 加盐
PEPPER=<random_salt_string>

# FC 后端 DeepSeek API Key
API_KEY=<your_deepseek_api_key>

# IP 白名单（跳过密码验证），JSON 数组格式
ALLOWED_IP=["127.0.0.1","x.x.x.x"]
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`。

## 架构说明

### 认证流程

1. 用户在 `/` 输入密码 → `authenticate.ts` 校验
2. Main 房间密码优先本地对比，失败后尝试 FC 后端查询房间密码
3. 成功后签发 JWT（`token` cookie，3 天有效），写入 `room` 字段
4. 前端调用 `/auth` 获取 STS 临时凭证（1 小时有效），初始化 OSS 客户端

### 路由守卫 (middleware.ts)

| 条件 | 行为 |
| --- | --- |
| 未知路径 | 重定向到 `/` |
| 已知路径，无 token | 重定向到 `/` |
| `/auth`，无 token | 返回 401 |
| 有 token，访问他人房间 | 重定向到自己的房间 |
| Main 用户访问 `/rooms/` | 重定向到 `/success/` |
| IP 白名单 | 跳过所有验证，自动签发 main token |

### OSS 路径规范

| 模式 | 前缀 | 归档天数 |
| --- | --- | --- |
| Main 房间 | `files/YYYY-MM-DD/filename` | 7 天 |
| 自定义房间 | `rooms/{room}/YYYY-MM-DD/filename` | 14 天 |

### FC 后端

`src/file-transfer-fc.js` 部署在阿里云函数计算，提供以下端点：

| 端点 | 用途 |
| --- | --- |
| `POST /download` | 为选中文件创建临时 zip |
| `POST /zip` | 为当天全部文件生成预构建 zip |
| `PUT /oper` | 记录操作日志（upload/download/delete） |
| `PUT /create` | 创建新房间 |
| `POST /check` | 校验房间密码 |
| `POST /wakeup` | 唤醒冷启动 |

## 部署

### Vercel/Netlify

推送到 GitHub 后在 Vercel 或 Netlify 导入项目，在 Settings > Environment Variables
中添加所有 `.env` 变量。注意 Free 版本有 10s 超时限制。

### 自部署

```bash
npm run build
npm start
# 或使用 PM2：pm2 start npm --name "filetransfer" -- start
```

## 配置说明

| 配置项 | 位置 | 说明 |
| --- | --- | --- |
| `archiveDays` | `RoomConfig` (page.tsx) | 文件归档过期天数 |
| `enableZipEndpoint` | `RoomConfig` | 是否启用 /zip 和预构建 zip |
| `enableOperCalls` | `RoomConfig` | 是否记录操作日志 |
| `trailingSlash` | `next.config.ts` | URL 尾部斜杠 |
| `matcher` | `middleware.ts` | 中间件拦截范围 |

## License

MIT
