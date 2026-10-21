export { client, unwrap, ApiError, setCsrfToken } from '@msgdock/api-client';
export type { components } from '@msgdock/api-client';
export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  key: string | null;
  enabled: boolean;
  revokedAt: string | null;
  createdAt: string;
};
export type Target = {
  id: string;
  name: string;
  channelId: string;
  config: Record<string, unknown>;
  channel: { name: string; shortId: string; type: string; enabled: boolean };
};
export type Channel = {
  id: string;
  shortId: string;
  name: string;
  type: string;
  pluginVersion: string;
  configVersion: number;
  enabled: boolean;
  lastStatus: string;
  lastCheckedAt: string | null;
  targets: Target[];
};
export type Template = {
  id: string;
  key: string;
  name: string;
  versions: { id: string; version: number; body: string; createdAt: string }[];
};
export type Topic = { id: string; key: string; name: string; targetIds: string[] };
export type Delivery = {
  id: string;
  status: string;
  targetName: string;
  attemptCount: number;
  createdAt: string;
  error: { code: string; message: string; source_code: string | null } | null;
  channelId: string;
  replayOfDeliveryId: string | null;
  notification: {
    apiKey: { id: string; name: string; prefix: string } | null;
    idempotencyScope: string;
  };
};
export const statusNames: Record<string, string> = {
  pending: '排队中',
  sending: '发送中',
  retry_wait: '等待重试',
  accepted: '平台已接受',
  failed: '发送失败',
  expired: '已过期',
  cancelled: '已取消',
  unknown: '结果待确认',
};
export const statusColors: Record<string, string> = {
  pending: 'default',
  sending: 'processing',
  retry_wait: 'blue',
  accepted: 'green',
  failed: 'red',
  expired: 'default',
  cancelled: 'default',
  unknown: 'gold',
};
