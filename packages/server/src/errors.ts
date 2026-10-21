import { HttpException } from '@nestjs/common';

export const errorCatalog = {
  INVALID_ARGUMENT: [400, '请求参数无效'],
  AUTHENTICATION_REQUIRED: [401, '请求需要认证'],
  ACCESS_DENIED: [403, '没有访问权限'],
  VALIDATION_ERROR: [400, '请求参数校验失败'],
  API_KEY_REQUIRED: [401, '请通过 Authorization: Bearer <API_KEY> 提供密钥'],
  API_KEY_INVALID: [401, 'API Key 无效或已撤销'],
  API_KEY_APP_MISMATCH: [403, 'API Key 不属于该应用'],
  APPLICATION_UNAVAILABLE: [401, '应用不存在或已停用'],
  APPLICATION_DISABLED: [403, '应用已停用'],
  IDEMPOTENCY_KEY_INVALID: [400, 'idempotency_key 必须是 1–200 个可见 ASCII 字符'],
  IDEMPOTENCY_CONFLICT: [409, '相同幂等键对应不同请求'],
  RATE_LIMITED: [429, '请求频率超限，请稍后重试'],
  MESSAGE_SOURCE_INVALID: [400, 'message 与 template 必须且只能提供一个'],
  TOPIC_NOT_FOUND: [400, '主题不存在'],
  TARGETS_INVALID: [400, '目标数量必须为 1–500'],
  TARGET_NOT_AUTHORIZED: [403, '应用无权访问目标'],
  TARGET_UNAVAILABLE: [400, '目标不存在或渠道已停用'],
  TEMPLATE_NOT_FOUND: [400, '模板不存在'],
  MESSAGE_INVALID: [400, '消息不能为空且最多 2000 字节'],
  CHANNEL_PLUGIN_UNAVAILABLE: [400, '目标插件版本不可用或不支持当前消息，请检查渠道'],
  QUEUE_CAPACITY_EXCEEDED: [503, '投递积压达到受理上限'],
  NOTIFICATION_NOT_FOUND: [404, '通知不存在'],
  DELIVERY_NOT_FOUND: [404, '投递不存在'],
  SESSION_REQUIRED: [401, '请先登录'],
  SETUP_TOKEN_INVALID: [401, '初始化令牌无效'],
  ALREADY_INITIALIZED: [409, '系统已经完成初始化'],
  LOGIN_FAILED: [401, '用户名或密码错误'],
  PASSWORD_INVALID: [400, '原密码不正确'],
  ORIGIN_NOT_ALLOWED: [403, '请求来源不允许'],
  CSRF_INVALID: [403, 'CSRF 校验失败'],
  APPLICATION_NOT_FOUND: [404, '应用不存在'],
  CHANNEL_NOT_FOUND: [404, '渠道不存在'],
  CHANNEL_TYPE_IMMUTABLE: [400, '已有渠道不能修改类型'],
  CHANNEL_VERSION_IMMUTABLE: [400, '已有渠道不能直接切换插件版本；请创建新渠道并排空旧任务'],
  CHANNEL_CONFIG_INVALID: [400, '渠道插件配置无效'],
  DELIVERY_STATE_CONFLICT: [409, '当前投递状态不允许此操作'],
  DELIVERY_CONFIRMATION_REQUIRED: [400, '请先核实重复风险并明确确认'],
  APPLICATION_ACCESS_REVOKED: [400, '应用已停用或目标授权已撤回'],
  CHANNEL_DISABLED: [400, '目标渠道已停用'],
  COORDINATION_UNAVAILABLE: [503, '队列协调服务暂时不可用，请稍后重试'],
  TEMPLATE_SYNTAX_INVALID: [400, '首版模板只支持 {{variable}} 变量'],
  TEMPLATE_VARIABLE_INVALID: [400, '模板变量缺失或类型无效'],
  RESOURCE_CONFLICT: [409, '标识已存在，请换一个名称或 Key'],
  RESOURCE_NOT_FOUND: [404, '资源不存在'],
  RESOURCE_ID_INVALID: [400, '资源标识格式无效'],
  DATABASE_UNAVAILABLE: [503, '数据服务暂时不可用，请稍后重试'],
  REQUEST_TOO_LARGE: [413, '请求内容超过大小限制'],
  UNSUPPORTED_MEDIA_TYPE: [415, '不支持的请求内容类型'],
  ROUTE_NOT_FOUND: [404, '接口不存在'],
  METHOD_NOT_ALLOWED: [405, '请求方法不允许'],
  SERVICE_UNAVAILABLE: [503, '服务暂时不可用'],
  BAD_GATEWAY: [502, '上游服务暂时不可用'],
  GATEWAY_TIMEOUT: [504, '上游响应超时，操作结果可能需要查询确认'],
  INTERNAL_ERROR: [500, '服务暂时不可用'],
} as const;

export type ErrorCode = keyof typeof errorCatalog;
export interface ValidationIssue {
  field: string;
  message: string;
}
export class ServiceError extends HttpException {
  constructor(code: ErrorCode, message?: string, details?: ValidationIssue[]) {
    super(
      { code, message: message ?? errorCatalog[code][1], ...(details ? { details } : {}) },
      errorCatalog[code][0],
    );
  }
}
