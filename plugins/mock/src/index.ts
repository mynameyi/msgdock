import { ChannelPlugin, emptySchema, httpFailure } from '@msgdock/plugin-sdk';

/** Never registered by the production catalog. No arbitrary destinations, even in test mode. */
export function mockPlugin(endpoint: string): ChannelPlugin {
  if (!/^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):\d+\/send$/.test(endpoint))
    throw new Error('Test endpoint not configured');
  return {
    descriptor: {
      id: 'mock',
      name: '测试渠道',
      description: '独立集成测试专用，不向真实 IM 发送。',
      version: '1.0.0',
      sdkApiVersion: 1,
      configVersion: 1,
      testOnly: true,
      capabilities: { messageTypes: ['text'], transport: 'http', maxTextBytes: 2000 },
      rateLimit: { capacity: 20, intervalMs: 60000 },
      network: { allowedHosts: [new URL(endpoint).hostname] },
      configSchema: emptySchema,
      targetSchema: emptySchema,
      uiSchema: { config: {}, target: {} },
    },
    create() {
      return {
        async send({ text, http }) {
          const response = await http.post({ url: endpoint, body: { text }, purpose: 'delivery' });
          const failure = httpFailure(response);
          if (failure) return failure;
          const data = (await response.json()) as { code?: number };
          if (data.code === 0) return { kind: 'accepted' };
          return { kind: 'failed', code: String(data.code), message: '模拟平台业务错误' };
        },
      };
    },
  };
}
