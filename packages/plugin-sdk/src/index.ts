/** SDK major is checked before a plugin can be registered. No NestJS/Prisma dependency. */
export const SDK_API_VERSION = 1;
export type ConfigValues = Record<string, unknown>;

/** The first renderer supports flat objects with string, boolean and integer fields. */
export interface FieldSchema {
  type: 'string' | 'boolean' | 'integer';
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}
export interface ConfigSchema {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, FieldSchema>;
  required: string[];
}
export interface UiField {
  label: string;
  widget?: 'password' | 'textarea';
  help?: string;
  placeholder?: string;
}
export interface PluginDescriptor {
  id: string;
  name: string;
  description: string;
  version: string;
  sdkApiVersion: number;
  configVersion: number;
  capabilities: {
    messageTypes: ['text'];
    transport: 'http';
    maxTextBytes: number;
  };
  rateLimit: { capacity: number; intervalMs: number };
  network: { allowedHosts: string[] };
  configSchema: ConfigSchema;
  targetSchema: ConfigSchema;
  uiSchema: { config: Record<string, UiField>; target: Record<string, UiField> };
  testOnly?: boolean;
}
export type SendOutcome =
  | { kind: 'accepted'; platformMessageId?: string }
  | { kind: 'retry' | 'failed' | 'unknown'; code: string; message: string; retryAfterMs?: number };
export interface HttpRequest {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  /** Auth requests never send a notification; delivery requests persist the send marker first. */
  purpose: 'auth' | 'delivery';
}
export interface PluginHttpClient {
  post(request: HttpRequest): Promise<Response>;
}
export interface PluginContext {
  now(): number;
}
export interface SendInput {
  text: string;
  target: ConfigValues;
  http: PluginHttpClient;
}
export interface ChannelAdapter {
  send(input: SendInput): Promise<SendOutcome>;
  /** Reserved for connection-based adapters; current built-ins are HTTP-only. */
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
export interface ChannelPlugin {
  descriptor: PluginDescriptor;
  /** Additional protocol constraints after host-side schema validation. Must not perform I/O. */
  validateConfig?(config: ConfigValues): void;
  create(context: PluginContext, config: ConfigValues): ChannelAdapter;
}

export function assertOfficialWebhook(
  value: unknown,
  hostname: string,
  validPath: (url: URL) => boolean,
): void {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('Webhook 地址无效');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !validPath(url)
  )
    throw new Error('请使用该平台官方 HTTPS Webhook 地址');
}

/** Common HTTP classification; each adapter still interprets its platform's business code. */
export function httpFailure(response: Response): SendOutcome | undefined {
  if (response.status === 429) {
    const value = response.headers.get('retry-after');
    const seconds = value === null ? 5 : Number(value);
    return {
      kind: 'retry',
      code: 'rate_limited',
      message: '平台限流，等待重试',
      retryAfterMs: Number.isFinite(seconds)
        ? Math.min(300000, Math.max(1000, seconds * 1000))
        : 5000,
    };
  }
  if (response.status >= 500)
    return { kind: 'unknown', code: 'upstream_5xx', message: '平台返回服务错误，结果待核实' };
  if (!response.ok)
    return {
      kind: 'failed',
      code: `http_${response.status}`,
      message: '平台拒绝请求，请检查渠道配置与权限',
    };
  return undefined;
}

export const emptySchema: ConfigSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
  required: [],
};
