import { ChannelPlugin, httpFailure } from '@msgdock/plugin-sdk';

export const dingtalkBot: ChannelPlugin = {
  descriptor: {
    id: 'dingtalk.enterprise_bot',
    name: '钉钉企业机器人',
    description: '使用企业内部应用与机器人 OpenAPI 向已加入的群发送文本。',
    version: '1.0.0',
    sdkApiVersion: 1,
    configVersion: 1,
    capabilities: { messageTypes: ['text'], transport: 'http', maxTextBytes: 2000 },
    rateLimit: { capacity: 20, intervalMs: 60000 },
    network: { allowedHosts: ['api.dingtalk.com'] },
    configSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        appKey: { type: 'string', minLength: 1, maxLength: 200 },
        appSecret: { type: 'string', minLength: 1, maxLength: 200 },
        robotCode: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['appKey', 'appSecret', 'robotCode'],
    },
    targetSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { openConversationId: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['openConversationId'],
    },
    uiSchema: {
      config: {
        appKey: { label: 'AppKey', widget: 'password' },
        appSecret: { label: 'AppSecret', widget: 'password' },
        robotCode: { label: 'RobotCode' },
      },
      target: {
        openConversationId: {
          label: 'OpenConversationId',
          help: '机器人须加入目标群，并完成对应 API 权限授权。',
        },
      },
    },
  },
  create(_context, config) {
    return {
      async send({ text, target, http }) {
        const tokenResponse = await http.post({
          url: 'https://api.dingtalk.com/v1.0/oauth2/accessToken',
          purpose: 'auth',
          body: { appKey: config.appKey, appSecret: config.appSecret },
        });
        const token = (await tokenResponse.json()) as { accessToken?: string };
        if (!tokenResponse.ok || !token.accessToken)
          return {
            kind: tokenResponse.status >= 500 || tokenResponse.status === 429 ? 'retry' : 'failed',
            code: 'token_failed',
            message: '钉钉应用凭证获取失败',
          };
        const response = await http.post({
          url: 'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
          purpose: 'delivery',
          headers: { 'x-acs-dingtalk-access-token': token.accessToken },
          body: {
            robotCode: config.robotCode,
            openConversationId: target.openConversationId,
            msgKey: 'sampleText',
            msgParam: JSON.stringify({ content: text }),
          },
        });
        const failure = httpFailure(response);
        if (failure) return failure;
        const data = (await response.json()) as { code?: unknown; processQueryKey?: unknown };
        if (typeof data.processQueryKey === 'string' && !data.code)
          return { kind: 'accepted', platformMessageId: data.processQueryKey };
        if (Number(data.code) === 130101)
          return { kind: 'retry', code: String(data.code), message: '平台限流，等待重试' };
        if (data.code === undefined)
          return { kind: 'unknown', code: 'invalid_response', message: '未取得平台明确结果' };
        return {
          kind: 'failed',
          code: String(data.code).slice(0, 80),
          message: '平台业务校验未通过，请检查凭证、权限或消息规则',
        };
      },
    };
  },
};
