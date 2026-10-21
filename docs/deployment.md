# MsgDock 0.2.0 部署与运维

## 单镜像启动

一个最终镜像内运行控制台、API、Worker、PostgreSQL 18 与 Redis。默认只发布 HTTP 端口 3000；内置数据服务监听容器回环地址，无需额外数据库或 Redis 容器。当前已验证 Linux / amd64 容器。

```sh
docker build -t msgdock:0.2.0 .
docker run -d --name msgdock --restart unless-stopped --stop-timeout 90 -p 127.0.0.1:3300:3000 -v msgdock-data:/data msgdock:0.2.0
docker exec msgdock cat /data/secrets/setup-token
```

打开 <http://localhost:3300> 是公开产品首页。进入 <http://localhost:3300/console>，输入初始化令牌并创建管理员，密码至少 12 位。没有通用默认密码。首次管理员创建后，初始化接口关闭；登录后可在系统设置修改密码。

公开开发文档位于 `/docs`，其中 `/docs/swagger` 提供 Swagger UI 调试，`/docs/redoc` 提供 ReDoc 阅读视图，`/docs/plugins` 提供插件开发指南。这些页面无需登录，不读取实例的渠道、密钥或运行状态。`/openapi.json` 只提供通知 API 的公开契约。页面、渲染器和样式均随镜像提供，无需额外文档容器或 CDN。

反向代理需同时转发 `/`、`/docs/*`、`/console/*`、`/assets/*`、`/openapi.json` 与 `/api/*` 到本容器，保留原始路径。旧后台地址如 `/channels` 会由前端兼容跳转至 `/console/channels`。公开页面不改变管理接口的认证与 CSRF 规则，所有有效 API Key 仅授权通知接口，管理接口仍需管理员会话。

仓库中的 `compose.yaml` 是同一部署方式的单服务示例：

```sh
docker compose up --build -d
```

网络较慢时可显式指定构建镜像源，无需修改全局 Docker 或 npm 配置：

```sh
docker build --build-arg ALPINE_MIRROR=https://mirrors.aliyun.com/alpine --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t msgdock:0.2.0 .
```

## 初始化、密钥与持久化

| 路径 | 内容 |
| --- | --- |
| /data/postgres | 数据库目录；镜像拒绝不匹配的数据库主版本 |
| /data/redis | Redis AOF 与协调数据 |
| /data/secrets/master-key | 首次生成的 32 字节 Base64 加密主密钥，后续复用 |
| /data/secrets/setup-token | 实例初始化令牌，初始化后无法再次注册管理员 |
| /data/secrets/db-password | 内置数据库应用账户密码 |
| /data/uploads | 预留的文件目录；首版未开放媒体接口 |

可以通过 `MSGDOCK_MASTER_KEY` 注入原有主密钥；必须是 Base64 编码的 32 字节值。已有数据缺失主密钥时启动失败，避免自动生成新密钥导致旧凭证无法解密。更换主密钥需要同步重新加密数据，首版没有在线轮换工具。

容器内由 tini 与 Supervisor 管理进程。先初始化内置数据服务并执行迁移，再运行 API 和 Worker；停机先停止业务进程，再关闭数据服务。应用、数据库和 Redis 使用独立服务账户。日志不输出 API Key、密码或完整 Webhook 地址。

## 接入与鉴权

1. 添加企业微信群机器人、飞书群机器人或钉钉企业机器人。每个渠道创建一个注册目标，列表中的“渠道 ID”支持复制并可直接填入通知 API 的 target.ids；钉钉另需填写群的 OpenConversationId。
2. 系统鉴权默认开启，在“API Key”页面创建一个独立 Key，只需填写名称。
3. Key 列表支持完整查看和复制；旧版本仅存摘要的 Key 会提示无法还原。业务服务端使用 `Authorization: Bearer <API_KEY>` 请求头。
4. 需要免 Key 调用时，在“系统设置 → 通知 API 鉴权”关闭开关。发送和查询都可不带 Key；携带无效 Key 仍会被拒绝。后台管理员登录不受影响。
5. 使用测试发送检查配置，再从接口文档复制请求示例。JSON 的 idempotency_key 为可选字段：不传时每次发送，需防止重复通知时提供，并在同一业务重试时复用原值。API Key 仍在 Authorization 请求头中。

业务和管理接口统一返回 code/message/data/request_id，业务结果从 data 读取。HTTP 202 表示持久化受理，查询 HTTP 200 / code=OK 与投递成功相互独立。具体约定见[响应与错误码](api-contract.md)，公开页面为 `/docs/responses`。升级时同步更新调用方：旧 Idempotency-Key 头不再提供幂等参数；投递原因从 error 读取。保留已有数据卷和主密钥。

企业微信与飞书仅接受对应官方 HTTPS Webhook URL；钉钉使用固定官方 OpenAPI 端点。通知调用方不能提交任意外部地址。

## 插件与版本升级

当前内置三个可信渠道插件，配置字段、目标字段、消息能力和实例限额由插件声明。渠道页面读取管理接口 `/api/admin/channel-plugins` 的目录生成配置表单；现有平台的配置与发送方式保持兼容。

插件已编译进镜像，不需要额外挂载目录或启动额外容器。新增或更新插件需要重建整个镜像、重建容器；API 与 Worker 必须使用同一目录。当前不支持上传插件、在线安装、热替换，也不会从 `/data/plugins` 加载代码。开发与发布步骤见[渠道插件约定](channel-plugins.md)。

从 0.1.0 升级时，启动迁移会为现有渠道补充插件版本 1.0.0 / 配置结构版本 1，并从原渠道类型回填历史投递的插件 ID。凭证密文、会话和 API Key 保留，旧任务继续绑定原版本。升级前备份数据库和原密钥；验证渠道、历史任务和队列恢复后再接入新流量。

渠道短 ID 迁移 `202610210002_channel_short_ids` 会为已有渠道自动分配 `ch_` 加 12 位小写十六进制字符的唯一 ID，并设置新渠道的生成规则。数据库内部的渠道和目标 UUID、主题路由、历史投递与密钥保持不变。API、Worker 及 Prisma Client 需由新镜像一并更新；容器启动时先完成迁移。通知 API 的 target.ids 及控制台测试发送仅接受渠道短 ID，调用方应从渠道列表复制 ID，UUID 请求返回参数校验错误。

已有渠道不能直接改插件 ID 或版本。升级采用新建渠道、调整主题路由、排空旧任务、停用旧渠道的流程。移除内置插件前检查所有关联渠道和待执行任务；缺失的原版本不会静默换成当前版本，任务会明确失败。注册表支持同时保留多个版本，便于旧任务排空。

移除 `event` 的迁移 `202610210003_remove_notification_event` 会删除 `Notification.event` 列，请求、查询响应和控制台不再使用事件类型。升级前备份数据库；其他通知字段、投递、渠道及授权保持不变。旧幂等记录继续保留，摘要不匹配时仍返回 409，详见[响应规范](api-contract.md)。

独立 API Key 迁移 `202610210004_global_api_keys` 会保留已有 Key 摘要与历史消息，移除接入应用模型，并统一默认开启系统鉴权。调用路径不再包含应用标识。完整迁移规则见[API Key 与系统鉴权](api-authentication.md)。

## HTTPS 与访问地址

默认示例绑定宿主机 127.0.0.1。对外服务时由已有网关终结 HTTPS，并设置 `PUBLIC_URL=https://your-host.example`、`COOKIE_SECURE=true`；网关保留对应 Host。配置的 PUBLIC_URL 用于管理写请求的来源检查，不用于放宽 CORS。业务系统 API Key 不写入前端代码或 URL。

## 健康与恢复

`/health/live` 检查 API 进程；`/health/ready` 同时检查数据库、Redis 与 Worker 最近心跳。Docker HEALTHCHECK 每 15 秒检查一次，初始化允许 90 秒启动时间。系统设置可查看 Worker 与 Redis 状态。

```sh
docker inspect msgdock --format '{{.State.Health.Status}}'
docker logs --tail 100 msgdock
docker restart --timeout 90 msgdock
```

PostgreSQL 保存通知、计划、幂等与发送证据；Redis 队列丢失后按数据库中待执行计划补回。sending 租约失效且请求可能已经开始时标为 unknown，不直接重发。平台超时也标为 unknown；通过界面核实结果或明确确认风险后创建关联重发，原记录保留。

Redis 不可用时暂停执行，MVP 也会拒绝依赖 Redis 限额校验的新受理请求；客户端可在恢复后重试，已提供幂等键时复用原值。当前固定 60 秒投递租约，单次 HTTP 超时默认 10 秒，最多 6 次真实发送尝试。

## 备份与升级

数据卷必须独立保留。备份至少包含数据库与原加密主密钥；Redis 可以根据数据库中的待执行事实补偿重建。消息正文和审计暂不自动清理，需自行监控卷容量。

在线数据库备份使用 PostgreSQL 工具，例如：

```sh
docker exec -u postgres msgdock pg_dump -U postgres -d msgdock -Fc -f /tmp/msgdock-backup.dump
docker cp msgdock:/tmp/msgdock-backup.dump ./msgdock-backup.dump
docker cp msgdock:/data/secrets ./msgdock-secrets-backup
```

妥善保护密钥备份；恢复数据库时同时恢复对应密钥。在线复制整个 /data 目录不是一致性数据库备份；完整卷快照应在有序停机后进行。

升级前完成备份，重建新版本镜像、停止旧容器，再以同一个数据卷创建新容器。迁移失败时业务入口不会启动。不将同一卷挂载给多个活动实例，也不自动跨 PostgreSQL 主版本升级。破坏性迁移后的回退应恢复相应备份，不直接换回旧应用镜像。

## 本地开发

Node.js 24、pnpm 11.25.0。按 `.env.example` 配置独立开发数据库、Redis 和随机密钥。开发数据与正式卷隔离。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
node --env-file=.env apps/api/dist/main.js
node --env-file=.env apps/worker/dist/main.js
pnpm dev:console
```

后两项分别在自己的终端运行。Windows 上运行中的 Prisma DLL 会被锁定，重新 generate 前先停止开发 API 和 Worker。前端 Vite 代理默认指向 3302；如果更换开发 API 端口，同时调整代理配置。

## 测试实例

`MSGDOCK_TEST_MODE=true` 仅用于独立测试实例，允许 mock 渠道；`MSGDOCK_TEST_SERVER` 指向受控的本地模拟平台。正式实例不启用该选项。

CI 使用单容器运行集成测试、重启恢复及 Redis 队列丢失恢复，并使用独立数据卷。`scripts/container-recovery.mjs` 会清空测试 Redis，只允许运行在名称为 msgdock-qa 或 msgdock-ci 的一次性测试容器中。
