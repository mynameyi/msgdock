export const CHANNEL_TYPES = [
  'wecom.group_webhook',
  'feishu.group_webhook',
  'dingtalk.enterprise_bot',
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number] | 'mock';
export type DeliveryStatus =
  | 'pending'
  | 'sending'
  | 'retry_wait'
  | 'accepted'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'unknown';
export interface ChannelCredentials {
  webhookUrl?: string;
  secret?: string;
  appKey?: string;
  appSecret?: string;
  robotCode?: string;
}
export interface TargetConfig {
  openConversationId?: string;
}
export type SendOutcome =
  | { kind: 'accepted'; platformMessageId?: string }
  | { kind: 'retry' | 'failed' | 'unknown'; code: string; message: string; retryAfterMs?: number };
export interface SendContext {
  type: ChannelType;
  credentials: ChannelCredentials;
  target: TargetConfig;
  text: string;
  timeoutMs?: number;
  beforeRequest: () => Promise<void>;
}
export interface SendJob {
  deliveryId: string;
  generation: number;
}
