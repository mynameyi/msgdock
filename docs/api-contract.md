# 响应规范与错误码

## 请求与幂等

业务通知使用 `POST /api/v1/notifications`，请求类型为 `application/json`。默认通过 HTTP 请求头 `Authorization: Bearer <API_KEY>` 鉴权；系统设置关闭鉴权后，发送和查询均可省略该头。无需应用标识；所有有效 Key 具有相同通知权限。详见[API Key 与鉴权](api-authentication.md)。

请求和查询响应不包含 `event` 字段，数据库也不保存该字段。继续提交 `event` 会返回 HTTP 400 / `VALIDATION_ERROR`。

```json
{
  "target": { "type": "topic", "key": "finance" },
  "message": { "text": "订单支付成功。" },
  "expires_in": 3600
}
```

`idempotency_key` 为可选字符串。省略时，每次请求都创建新通知，即使目标和内容完全相同也会分别发送，`data.idempotency_hit=false`。需要防止重试产生重复通知时，在 JSON 中增加该字段，例如 `"idempotency_key": "order-paid-20261021-001"`。

提供时必须包含 1–200 个可见 ASCII 字符，不含空白；`null`、空字符串或其他类型会返回 HTTP 400 / VALIDATION_ERROR。调用方为每次新的业务通知生成唯一值，同一请求重试时复用原值。可使用业务事件 ID，或首次发送前生成并保存的 UUID。

- 提供键时，同一 API Key、相同幂等键与相同内容：返回原通知，`data.idempotency_hit=true`，不创建新的投递计划。
- 提供键时，同一 API Key、相同幂等键与不同内容：返回 HTTP 409 / `IDEMPOTENCY_CONFLICT`。
- 不同 API Key 分别去重；无 Key 的匿名请求共用匿名去重范围。幂等记录随通知记录保存，当前没有自动过期清理。
- 此字段用于业务去重，不替代鉴权或请求签名防重放。

## 渠道 ID 与接收目标

在控制台“渠道管理”列表复制“渠道 ID”，直接用于发送请求：

```json
{ "type": "targets", "ids": ["ch_a7c92e4f6b18"] }
```

渠道 ID 由系统自动分配，格式为 `ch_` 加 12 位小写十六进制字符，在同一 MsgDock 实例中唯一且不随名称变化。示例 ID 需替换为实际渠道 ID。`target.ids` 仅接受渠道短 ID，重复 ID 只创建一份投递；提交 UUID 或将其混入短 ID 数组均返回 HTTP 400 / `VALIDATION_ERROR`，整个请求不受理。控制台测试发送也使用渠道短 ID。

短 ID 不是凭证；目标必须对应已启用的渠道，未知或停用的渠道返回 `TARGET_UNAVAILABLE`。开启鉴权时仍需提供 Bearer Key。主题 `target.type=topic` 的使用方式不变。相同幂等键重试时保持原始请求内容，避免触发幂等冲突。

升级迁移会自动为已有渠道分配短 ID，保留原 UUID、主题路由和历史投递快照。

## 统一响应

所有 `/api/v1/*` 业务接口与 `/api/admin/*` 管理接口采用同一外层结构，保留正确的 HTTP 状态码。

| 字段 | 含义 |
| --- | --- |
| code | 接口成功固定为 OK；接口失败使用稳定的原因码，程序按此字段分支 |
| message | 面向人的说明；文案可能调整，不用于程序分支 |
| data | 成功时的业务结果；接口失败固定为 null |
| request_id | 本次 HTTP 请求的追踪标识，也通过 X-Request-Id 响应头返回 |
| details | 可选的参数校验明细，含 field/message，不包含原请求值或凭证 |

相同幂等请求对应同一通知，但不同 HTTP 调用有各自的 request_id。`/openapi.json` 保持原始 OpenAPI 文档，健康检查保持探针结构，不套用业务响应。

HTTP 202 表示通知已持久化受理，不代表平台已接受消息：

```json
{
  "code": "OK",
  "message": "通知已受理",
  "data": {
    "notification_id": "69886e70-60e4-4b8f-81f9-fec706eabaf2",
    "status": "accepted_for_processing",
    "delivery_count": 1,
    "idempotency_hit": false
  },
  "request_id": "req_example"
}
```

HTTP 400 表示接口受理失败：

```json
{
  "code": "TARGET_UNAVAILABLE",
  "message": "目标不存在或渠道已停用",
  "data": null,
  "request_id": "req_example"
}
```

参数校验失败返回 HTTP 400 / `VALIDATION_ERROR`，并提供 `details`，例如 `[{ "field": "idempotency_key", "message": "idempotency_key must be a string" }]`。嵌套字段使用点分路径，如 target.ids。

## 查询与投递结果

查询成功返回 HTTP 200 / code=OK。实际结果在 data.deliveries、data.items 或单个投递对象中；每个目标使用 status 与 error 表达业务结果。

```json
{
  "code": "OK",
  "message": "请求成功",
  "data": {
    "id": "69886e70-60e4-4b8f-81f9-fec706eabaf2",
    "deliveries": [
      {
        "id": "d5d66a45-5aaf-4cc9-b512-67e2eca9c67a",
        "status": "failed",
        "targetName": "财务通知群",
        "attemptCount": 1,
        "error": {
          "code": "DELIVERY_FAILED",
          "message": "平台业务校验未通过，请检查凭证、权限或消息规则",
          "source_code": "40001"
        }
      }
    ]
  },
  "request_id": "req_example"
}
```

`error.code` 为 MsgDock 归一化原因；`error.source_code` 保留插件/平台原始代码，可能为 null，取值依赖插件。说明来自受控的插件解释，不直接透传平台原始响应。pending、sending、accepted、cancelled 的 error 为 null；retry_wait、failed、unknown、expired 包含相应原因。accepted 表示平台接受，不保证终端已读。

| 投递原因码 | 含义 |
| --- | --- |
| DELIVERY_FAILED | 投递明确失败，结合 source_code 核查 |
| DELIVERY_RESULT_UNKNOWN | 结果不明，先核实再决定是否重发 |
| DELIVERY_RETRY_PENDING | 等待核心的受控重试 |
| DELIVERY_EXPIRED | 已超过有效期 |
| API_ACCESS_REVOKED | API Key 或渠道已停用、撤销 |
| CHANNEL_PLUGIN_UNAVAILABLE | 固定的插件版本不可用 |
| CHANNEL_CONFIG_VERSION_MISMATCH | 配置版本不匹配 |
| CHANNEL_PLUGIN_PROTOCOL_ERROR / CHANNEL_PLUGIN_EXECUTION_FAILED | 插件契约或执行准备失败 |
| MESSAGE_TOO_LARGE | 内容超过渠道能力 |
| CHANNEL_AUTH_FAILED / CHANNEL_PREFLIGHT_FAILED | 获取鉴权信息或消息发送前准备失败，不等同于已确定凭证无效 |
| CHANNEL_RATE_LIMITED | 渠道限流 |

## 常见接口错误码

| HTTP | code | 处理方式 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR / INVALID_ARGUMENT / RESOURCE_ID_INVALID | 根据 details 修正字段或资源 ID |
| 400 | IDEMPOTENCY_KEY_INVALID | 检查 JSON 幂等键格式 |
| 400 | MESSAGE_SOURCE_INVALID | message 与 template 只提供一个 |
| 400 | TARGETS_INVALID / TARGET_UNAVAILABLE | 检查目标数量及渠道状态 |
| 400 | TOPIC_NOT_FOUND / TEMPLATE_NOT_FOUND | 配置有效主题或模板 |
| 400 | MESSAGE_INVALID / TEMPLATE_SYNTAX_INVALID / TEMPLATE_VARIABLE_INVALID | 修正正文或模板变量 |
| 400 | CHANNEL_CONFIG_INVALID / CHANNEL_PLUGIN_UNAVAILABLE | 检查插件配置和版本 |
| 401 | API_KEY_REQUIRED / API_KEY_INVALID | 检查 API Key 与系统鉴权设置 |
| 401 | SESSION_REQUIRED / LOGIN_FAILED / SETUP_TOKEN_INVALID | 检查管理员认证 |
| 403 | ORIGIN_NOT_ALLOWED / CSRF_INVALID | 检查来源或 CSRF |
| 404 | NOTIFICATION_NOT_FOUND / DELIVERY_NOT_FOUND | 检查通知或投递 ID |
| 404 | CHANNEL_NOT_FOUND / RESOURCE_NOT_FOUND / ROUTE_NOT_FOUND | 检查管理资源或路径 |
| 409 | IDEMPOTENCY_CONFLICT | 核查是否错误复用了键，不要盲目换键重试 |
| 409 | RESOURCE_CONFLICT / DELIVERY_STATE_CONFLICT / ALREADY_INITIALIZED | 修正冲突或操作状态 |
| 413 / 415 | REQUEST_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | 默认请求上限 64 KiB，使用 application/json |
| 429 | RATE_LIMITED | 退避后使用原业务键重试 |
| 503 | DATABASE_UNAVAILABLE / COORDINATION_UNAVAILABLE / QUEUE_CAPACITY_EXCEEDED / SERVICE_UNAVAILABLE | 服务恢复后使用原业务键重试或查询 |
| 500 | INTERNAL_ERROR | 记录 request_id，核查服务；不能据此推断业务一定未执行 |
| 502 / 504 | BAD_GATEWAY / GATEWAY_TIMEOUT | 原请求可能已受理，使用原键重试或查询 |

完整接口原因码维护在[错误码目录](../packages/server/src/errors.ts)，投递归一化维护在[投递展示映射](../packages/server/src/modules/deliveries/view.ts)。未知的新错误码应保留原码并显示通用提示，不根据 message 猜测结果。

## 升级与重试

需要幂等去重的客户端应把 Idempotency-Key 请求头移到 JSON 的可选 idempotency_key，并从响应 data 读取业务结果。旧头被忽略；仅提供旧头按无键请求处理，每次都会创建新通知，提供两者时以 JSON 为准。投递结果的 lastCode/lastMessage 调整为 error.code/message/source_code，发送尝试审计保留原始代码。

启动迁移会补齐渠道短 ID，并删除 Notification.event 列。API Key、会话、历史通知和投递记录保留；接入应用模型已移除，详情见鉴权迁移说明；idempotency_key 在计算业务请求摘要前拆出。

移除 event 会改变请求摘要。旧通知的幂等键及摘要继续保留，不会清空去重记录或重发旧通知；使用新请求结构复用旧键可能返回 HTTP 409 / IDEMPOTENCY_CONFLICT，此时应查询原通知核对结果。

连接失败、TLS 错误或网络超时时可能没有 JSON；HTTP 5xx 也不能证明业务未执行。已提供幂等键的请求可复用原键重试或查询；未提供时，重试可能重复发送，应先核对受理或投递结果。unknown 投递由控制台核实或确认风险后重发，调用方不要将其当作确定失败自动重发。
