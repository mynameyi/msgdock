import {
  ChannelPlugin,
  assertOfficialWebhook,
  emptySchema,
  httpFailure,
} from '@msgdock/plugin-sdk';

export const wecomWebhook: ChannelPlugin = {
  descriptor: {
    id: 'wecom.group_webhook',
    name: '企业微信群机器人',
    description: '使用企业微信群机器人的官方 Webhook 发送文本通知。',
    version: '1.0.0',
    sdkApiVersion: 1,
    configVersion: 1,
    capabilities: { messageTypes: ['text'], transport: 'http', maxTextBytes: 2000 },
    rateLimit: { capacity: 20, intervalMs: 60000 },
    network: { allowedHosts: ['qyapi.weixin.qq.com'] },
    configSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { webhookUrl: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['webhookUrl'],
    },
    targetSchema: emptySchema,
    uiSchema: {
      config: {
        webhookUrl: {
          label: 'Webhook 地址',
          widget: 'password',
          placeholder: 'https://qyapi.weixin.qq.com/…',
          help: '仅接受企业微信官方 HTTPS Webhook 地址。',
        },
      },
      target: {},
    },
  },
  validateConfig(config) {
    assertOfficialWebhook(
      config.webhookUrl,
      'qyapi.weixin.qq.com',
      (url) =>
        url.pathname === '/cgi-bin/webhook/send' &&
        !!url.searchParams.get('key') &&
        [...url.searchParams.keys()].every((key) => key === 'key'),
    );
  },
  create(_context, config) {
    return {
      async send({ text, http }) {
        const response = await http.post({
          url: String(config.webhookUrl),
          purpose: 'delivery',
          body: { msgtype: 'text', text: { content: text } },
        });
        const failure = httpFailure(response);
        if (failure) return failure;
        const data = (await response.json()) as { errcode?: unknown };
        if (data.errcode === 0) return { kind: 'accepted' };
        if ([45009, 45011].includes(Number(data.errcode)))
          return { kind: 'retry', code: String(data.errcode), message: '平台限流，等待重试' };
        if (data.errcode === undefined)
          return { kind: 'unknown', code: 'invalid_response', message: '未取得平台明确结果' };
        return {
          kind: 'failed',
          code: String(data.errcode).slice(0, 80),
          message: '平台业务校验未通过，请检查凭证、权限或消息规则',
        };
      },
    };
  },
};
