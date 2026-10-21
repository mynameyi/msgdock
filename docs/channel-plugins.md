# 渠道插件开发与运行约定

## 阅读入口

在产品首页选择“开发文档 → 插件开发”，或直接打开公开页面 `/docs/plugins`，无需登录。页面提供章节目录、表格、代码复制和本文下载；API 接入说明位于 `/docs`，Swagger UI 在线调试位于 `/docs/swagger`，ReDoc 接口参考位于 `/docs/redoc`。控制台侧栏“开发文档”在新页面打开公开文档，渠道管理的“已加载插件”区域也提供开发指南入口。

Swagger UI 与 ReDoc 展示通知发送、查询的 OpenAPI 契约；插件 SDK、注册、Schema 和执行边界由本文说明。创建渠道、配置凭证及查看实例插件目录仍需进入 `/console` 并登录。

页面在构建时直接读取本文件。修改约定后重新构建控制台即可同步页面与下载内容，无需另写一份前端文档。

## Workspace 包是什么

Workspace 包是同一个仓库中由 pnpm 统一管理的本地代码包，每个包有自己的 `package.json`、名称、依赖和构建脚本。仓库根目录的 `pnpm-workspace.yaml` 将 `apps/*`、`packages/*` 和 `plugins/*` 纳入工作区。

例如 `plugins/wecom-webhook` 是企业微信插件包，包名为 `@msgdock/plugin-wecom-webhook`；`packages/plugin-sdk` 是 SDK 包。插件中的 `"@msgdock/plugin-sdk": "workspace:*"` 表示依赖仓库里的 SDK，由 pnpm 建立本地链接，不需要先发布到 npm。当前插件作为独立包维护，构建时统一进入应用镜像。

## 当前范围

MsgDock 0.2.0 采用核心引擎、渠道插件和稳定 SDK 的组织方式。前端继续按 Feature-based 组织，后端继续使用 NestJS 业务模块；插件架构负责平台扩展边界。

本轮实现内置可信插件：独立 workspace 包、显式启动注册、版本校验、Schema 配置表单、统一宿主执行和版本化投递。插件编译进同一个 Docker 镜像，API 与 Worker 各自在启动时建立相同目录。没有在线插件安装、上传代码、运行时 npm install 或热替换接口，`/data/plugins` 尚不是加载目录。

## 插件、渠道与目标

| 概念 | 含义 |
| --- | --- |
| 插件 | 一种接入方式的协议实现、配置描述和能力，例如 wecom.group_webhook |
| 渠道实例 | 使用特定插件版本创建的机器人配置；拥有独立加密凭证与限额 |
| 接收目标 | 实例内的群或平台会话；当前每个渠道实例维护一个目标 |

一个插件可创建多个渠道实例。群 Webhook 和智能机器人长连接按不同接入方式拆分，避免将不同生命周期堆在同一个实现内。

当前每个渠道只有一个接收目标，创建和编辑时只填写“渠道名称”，例如“财务通知群”。目标显示名称自动沿用渠道名称，主题路由和发送测试也显示该名称。Webhook、会话 ID 等实际发送参数仍由插件 Schema 配置；名称只是本地备注，不决定消息发往哪里。编辑已有渠道时保留目标 ID 与路由引用，历史投递快照不变。

每个渠道实例由系统分配不可编辑的短 ID，例如 `ch_a7c92e4f6b18`（`ch_` 加 12 位小写十六进制字符）。渠道列表显示“渠道 ID”并支持复制，业务发送 API 的 `target.ids` 和控制台测试发送仅接受渠道短 ID，UUID 会被拒绝。短 ID 在实例内唯一，数据库唯一约束防止重复；新建时碰撞会重新分配，已有渠道在迁移时自动补齐，重命名或重启不会改变它。短 ID 不是凭证，开启系统鉴权时发送需要有效 API Key。当前短 ID 必须对应唯一接收目标，不会在多目标情况下猜测收件人。

| 插件 ID | 包 | 当前版本 |
| --- | --- | --- |
| wecom.group_webhook | @msgdock/plugin-wecom-webhook | 1.0.0 |
| feishu.group_webhook | @msgdock/plugin-feishu-webhook | 1.0.0 |
| dingtalk.enterprise_bot | @msgdock/plugin-dingtalk-bot | 1.0.0 |

`mock` 是独立测试插件，只在显式开启 MSGDOCK_TEST_MODE 的测试实例注册，且只允许受控本地模拟地址。正式目录不包含该插件。

## 代码与依赖

```text
packages/plugin-sdk/src/index.ts   # 无 NestJS / Prisma 依赖的插件接口与公共协议工具
packages/channels/src/
  builtin.ts                      # 内置插件装配点；API、Worker 复用
  registry.ts                     # 注册、精确版本解析、Schema 校验
  executor.ts                     # 出站边界、发送标记、生命周期与异常保护
plugins/
  wecom-webhook/src/index.ts       # 企业微信协议
  feishu-webhook/src/index.ts      # 飞书协议与签名
  dingtalk-bot/src/index.ts        # 钉钉平台鉴权和发送
  mock/src/index.ts               # 独立测试协议
apps/console/src/features/channels/
  PluginFields.tsx                 # 共享的 Ant Design Schema 表单渲染器
```

依赖方向为 server → channels → 各插件 → plugin-sdk。console 只从 SDK 导入描述类型，运行时通过管理 API 获取插件目录，不导入插件实现、服务器代码或平台凭证。contracts 复用 SDK 的跨包结果类型。

## 插件接口

以下接口的完整字段以 [SDK 源码](../packages/plugin-sdk/src/index.ts)为准：

```typescript
interface ChannelPlugin {
  descriptor: PluginDescriptor;
  validateConfig?(config: ConfigValues): void;
  create(context: PluginContext, config: ConfigValues): ChannelAdapter;
}

interface ChannelAdapter {
  send(input: SendInput): Promise<SendOutcome>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
```

descriptor 统一声明：

| 字段 | 约定 |
| --- | --- |
| id | 稳定插件 ID；已有渠道的 type 保留为此标识 |
| version | 精确插件版本，如 1.0.0；相同版本不得原地替换协议行为 |
| sdkApiVersion | SDK 主版本；当前只接受 1，不兼容时注册失败 |
| configVersion | 配置结构版本；当前三个官方插件为 1 |
| capabilities | 当前只支持 HTTP 传输、text 消息与 maxTextBytes |
| rateLimit | 实例令牌桶容量及补充周期，实际执行由核心负责 |
| network.allowedHosts | 宿主 HTTP 客户端允许访问的 HTTPS 主机 |
| configSchema / targetSchema | 配置与接收目标的 JSON Schema |
| uiSchema | 中文标签、密码或多行控件、提示、占位文本 |

描述信息和实现放在同一个 TypeScript 插件对象中，便于类型检查与版本同步；不另维护重复的 manifest.json。

Schema 采用 JSON Schema 的有界子集：根为 object，additionalProperties 必须为 false；属性为 string、boolean 或 integer，支持 required、字符串长度与枚举、整数上下限。属性名为字母开头的字母、数字或下划线，最长 80 位，且必须有对应 UI 标签。暂不支持嵌套对象、数组、远程引用或条件表单。宿主使用 Ajv 校验，插件可以通过 validateConfig 增加官方 Webhook 路径等协议约束；校验阶段禁止网络 I/O。

所有 configSchema 字段统一放在 credentials 对象中加密保存，不向浏览器回传；targetSchema 字段放在 targetConfig 中，必须只包含非敏感目标参数。编辑时缺省或空字符串保留已有凭证值；当前没有逐字段清除已有可选凭证的操作，需要清除时创建新渠道。页面切换插件会丢弃旧插件字段，服务端也拒绝额外字段。

## 核心与插件的边界

核心负责鉴权、授权、模板、路由、幂等、Outbox、队列、限速执行、重试调度、状态写入、凭证加密和审计。插件负责平台格式、签名、Token 请求、发送和平台业务错误解释，不访问数据库或自行建立队列、调度重试。

插件通过 SendInput.http.post 发起请求，明确 purpose：

- auth：获取平台鉴权信息，不计作一次真实消息发送。
- delivery：宿主先持久化发送标记并复核授权，再调用平台；一次 Attempt 至多一个消息请求。

HTTP 客户端限制已声明主机、HTTPS、禁止 URL 用户信息和重定向，并设置请求超时。官方 Webhook 插件另外限定对应官方路径。SDK 提供可复用 HTTP 分类工具，各插件仍必须解析 HTTP 200 中的平台业务结果，缺失明确成功证据时返回 unknown。

SendOutcome 的含义为：

| kind | 核心处理 |
| --- | --- |
| accepted | 平台明确接受；不代表用户已收到或已读 |
| retry | 平台明确允许安全重试，或消息请求前的临时鉴权失败；核心结合期限、次数和退避安排 |
| failed | 配置、权限、业务校验或插件契约错误；不自动重试 |
| unknown | 消息请求开始后超时、异常或结果不明；保留人工核查流程 |

插件抛出异常后，宿主根据是否已经开始消息请求决定 failed、retry 或 unknown，不把不确定发送当作普通失败自动重发。Worker 调用 SDK 前仍检查 API Key 与渠道状态、插件版本和配置结构版本。当前核心统一文本上限仍为 2000 UTF-8 字节，插件可以进一步收紧。

运行时按渠道实例、插件版本及配置摘要复用 adapter，start 在首次使用时执行。配置变更后旧适配器待在途调用结束再 stop；Worker 退出时先等待队列调用结束，再关闭适配器。生命周期接口已接通，但当前能力声明和官方插件只支持 HTTP，智能机器人连接、心跳、连接租约与事件回调尚未实现。

## 管理 API

`GET /api/admin/channel-plugins` 返回已注册版本的公开 descriptor，使用与其他管理接口相同的会话认证。目录包含 Schema、UI 描述和能力，不包含任何渠道实例的凭证。

创建渠道示例：

```json
{
  "name": "订单通知群",
  "type": "dingtalk.enterprise_bot",
  "pluginVersion": "1.0.0",
  "credentials": {
    "appKey": "YOUR_APP_KEY",
    "appSecret": "YOUR_APP_SECRET",
    "robotCode": "YOUR_ROBOT_CODE"
  },
  "targetConfig": { "openConversationId": "YOUR_CONVERSATION_ID" },
  "enabled": true
}
```

新渠道不传 pluginVersion 时使用启动装配中该插件最后注册的版本；生产发布应显式维护装配顺序，客户端建议总是传精确版本。已有渠道不能直接修改插件 ID 或版本，升级采用新建渠道、调整授权和路由、排空旧任务的流程。0.1.0 的 openConversationId 顶层字段作为兼容别名保留，新客户端使用 targetConfig；同时提供时以 targetConfig 为准。

创建和更新只需传 `name`，接收目标名称在保存时同步为该值。旧管理客户端的 `targetName` 字段仍可提交，但已弃用且不再生效；新客户端应省略它。本次调整不需要数据库迁移，已有渠道在下次保存时同步目标名称。

## 版本、迁移与发布

业务及管理 HTTP 响应统一使用 code/message/data/request_id。投递查询在 data 内返回 status 与 error（code/message/source_code）；插件仍返回原 SendOutcome，数据库中的 lastCode/lastMessage 与发送尝试保留原始证据。核心在读模型中完成归一化，不要求插件跟随 HTTP 外层封装。接口约定和错误码见[响应规范](api-contract.md)，公开阅读入口为 `/docs/responses`。

Channel 保存 type、pluginVersion、configVersion；Delivery 受理时固定 pluginId、pluginVersion、configVersion，重试和关联重发沿用原版本。凭证使用渠道当前有效密文，不复制明文凭证到任务快照。目标和正文沿用已固定快照。

0.1.0 → 0.2.0 的数据库迁移为现有渠道补充 1.0.0 / 配置版本 1，并从原渠道类型回填历史投递的插件 ID；不改动旧凭证密文、API Key 或会话。失去原渠道的历史记录标记为 legacy.unresolved，不猜测替代插件。

注册中心允许保留同 ID 的多个精确版本；旧任务只找原版本，不静默退回当前版本。未加载原版本时，新受理拒绝使用该渠道，待执行任务以 plugin_unavailable 明确失败且不调用平台。移除插件前先停用对应渠道的新流量、检查活动任务并排空；历史记录和审计继续保留。

新增内置插件：

1. 在 plugins/ 下建立独立 workspace 包，依赖 @msgdock/plugin-sdk，实现 descriptor 与 create。
2. 为平台签名、消息序列化、业务错误和异常结果编写测试，验证其配置 Schema 与公开描述不含实例凭证。
3. 将包声明为 @msgdock/channels 的依赖，在 builtin.ts 显式注册。无需修改业务服务、渠道 DTO 的类型列表或 React 平台表单。
4. 在 Dockerfile 安装依赖的阶段增加该包的 package.json COPY；插件实现和产物由 plugins/ 统一复制。
5. 更新锁文件，运行 pnpm build、pnpm lint、pnpm typecheck、pnpm test 与隔离测试实例的 API / 恢复验证。
6. 发布新的单体镜像，按[部署文档](deployment.md)备份并重建容器。API 与 Worker 必须使用同一个插件目录。

## 信任与后续阶段

当前插件是经过评审的可信应用代码，与 Worker 共享进程权限。宿主客户端是统一约束和故障保护，不是对恶意 JavaScript 的安全沙箱；插件也必须遵守凭证脱敏约定。

后续外部插件阶段再增加预编译离线包、来源与摘要校验、兼容性检查、安装状态、回滚与重启加载。对不受信任作者开放时，另行设计执行环境、文件和网络隔离；独立子进程或 Node.js 权限标志不能单独视为完整安全边界。当前不承诺任意第三方插件在单容器中安全运行。
