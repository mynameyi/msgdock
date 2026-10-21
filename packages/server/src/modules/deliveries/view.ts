interface DeliveryRecord {
  status: string;
  lastCode: string | null;
  lastMessage: string | null;
}
const hostCodes: Record<string, string> = {
  authorization_revoked: 'APPLICATION_ACCESS_REVOKED',
  plugin_unavailable: 'CHANNEL_PLUGIN_UNAVAILABLE',
  config_version_mismatch: 'CHANNEL_CONFIG_VERSION_MISMATCH',
  plugin_protocol_error: 'CHANNEL_PLUGIN_PROTOCOL_ERROR',
  plugin_execution_failed: 'CHANNEL_PLUGIN_EXECUTION_FAILED',
  message_too_large: 'MESSAGE_TOO_LARGE',
  token_failed: 'CHANNEL_AUTH_FAILED',
  preflight_failed: 'CHANNEL_PREFLIGHT_FAILED',
  rate_limited: 'CHANNEL_RATE_LIMITED',
};

/** Keep database/attempt evidence unchanged; publish a separate business outcome. */
export function deliveryView<T extends DeliveryRecord>(record: T) {
  const { lastCode, lastMessage, ...data } = record;
  const code =
    record.status === 'unknown'
      ? 'DELIVERY_RESULT_UNKNOWN'
      : record.status === 'expired'
        ? 'DELIVERY_EXPIRED'
        : lastCode && hostCodes[lastCode]
          ? hostCodes[lastCode]!
          : record.status === 'retry_wait'
            ? 'DELIVERY_RETRY_PENDING'
            : 'DELIVERY_FAILED';
  const hasError = ['failed', 'unknown', 'expired', 'retry_wait'].includes(record.status);
  return {
    ...data,
    error: hasError
      ? {
          code,
          message:
            record.status === 'expired'
              ? '投递已超过有效期'
              : (lastMessage ?? '投递尚未取得成功结果'),
          source_code: lastCode,
        }
      : null,
  };
}
