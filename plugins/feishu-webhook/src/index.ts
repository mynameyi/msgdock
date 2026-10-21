import { createHmac } from 'node:crypto';
import {
  ChannelPlugin,
  assertOfficialWebhook,
  emptySchema,
  httpFailure,
} from '@msgdock/plugin-sdk';

export function feishuSignature(timestamp: string, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}
export const feishuWebhook: ChannelPlugin = {
  descriptor: {
    id: 'feishu.group_webhook',
    name: '飞书群机器人',
    description: '使用飞书自定义机器人 Webhook 发送文本，支持可选签名。',
    version: '1.0.0',
    sdkApiVersion: 1,
    configVersion: 1,
    capabilities: { messageTypes: ['text'], transport: 'http', maxTextBytes: 2000 },
    rateLimit: { capacity: 60, intervalMs: 60000 },
    network: { allowedHosts: ['open.feishu.cn'] },
    configSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        webhookUrl: { type: 'string', minLength: 1, maxLength: 500 },
        secret: { type: 'string', maxLength: 200 },
      },
      required: ['webhookUrl'],
    },
    targetSchema: emptySchema,
    uiSchema: {
      config: {
        webhookUrl: {
          label: 'Webhook 地址',
          widget: 'password',
          help: '仅接受飞书官方 HTTPS Webhook 地址。',
        },
        secret: { label: '签名密钥', widget: 'password', help: '机器人启用签名校验时填写。' },
      },
      target: {},
    },
  },
  validateConfig(config) {
    assertOfficialWebhook(
      config.webhookUrl,
      'open.feishu.cn',
      (url) => /^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(url.pathname) && !url.search,
    );
  },
  create(context, config) {
    return {
      async send({ text, http }) {
        const timestamp = String(Math.floor(context.now() / 1000));
        const response = await http.post({
          url: String(config.webhookUrl),
          purpose: 'delivery',
          body: {
            msg_type: 'text',
            content: { text },
            ...(config.secret
              ? { timestamp, sign: feishuSignature(timestamp, String(config.secret)) }
              : {}),
          },
        });
        const failure = httpFailure(response);
        if (failure) return failure;
        const data = (await response.json()) as { code?: unknown; StatusCode?: unknown };
        const code = data.code ?? data.StatusCode;
        if (code === 0 || code === '0') return { kind: 'accepted' };
        if ([11232, 99991400].includes(Number(code)))
          return { kind: 'retry', code: String(code), message: '平台限流，等待重试' };
        if (code === undefined)
          return { kind: 'unknown', code: 'invalid_response', message: '未取得平台明确结果' };
        return {
          kind: 'failed',
          code: String(code).slice(0, 80),
          message: '平台业务校验未通过，请检查凭证、权限或消息规则',
        };
      },
    };
  },
};
