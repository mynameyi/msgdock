import { ChannelExecutor, createBuiltinRegistry } from './index';
import { dingtalkBot } from '@msgdock/plugin-dingtalk-bot';
test('钉钉鉴权准备不标记发送，消息请求前才持久化，返回平台消息 ID', async () => {
  const original = global.fetch;
  const order: string[] = [];
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('oauth2')) {
      order.push('auth');
      return new Response(JSON.stringify({ accessToken: 'test-token' }));
    }
    order.push('send');
    return new Response(JSON.stringify({ processQueryKey: 'message-1' }));
  });
  const executor = new ChannelExecutor(createBuiltinRegistry());
  try {
    expect(
      await executor.execute({
        channelId: 'ding',
        pluginId: dingtalkBot.descriptor.id,
        pluginVersion: '1.0.0',
        configVersion: 1,
        credentials: { appKey: 'key', appSecret: 'secret', robotCode: 'robot' },
        target: { openConversationId: 'conversation' },
        text: 'hello',
        beforeRequest: async () => {
          order.push('marker');
        },
      }),
    ).toEqual({ kind: 'accepted', platformMessageId: 'message-1' });
    expect(order).toEqual(['auth', 'marker', 'send']);
  } finally {
    global.fetch = original;
    await executor.close();
  }
});
test('钉钉 Token 网络失败允许核心重试，尚未发送消息', async () => {
  const original = global.fetch;
  const beforeRequest = jest.fn(async () => {});
  global.fetch = jest.fn(async () => {
    throw new Error('auth timeout');
  });
  const executor = new ChannelExecutor(createBuiltinRegistry());
  try {
    expect(
      await executor.execute({
        channelId: 'ding',
        pluginId: dingtalkBot.descriptor.id,
        pluginVersion: '1.0.0',
        configVersion: 1,
        credentials: { appKey: 'key', appSecret: 'secret', robotCode: 'robot' },
        target: { openConversationId: 'conversation' },
        text: 'hello',
        beforeRequest,
      }),
    ).toMatchObject({ kind: 'retry', code: 'preflight_failed' });
    expect(beforeRequest).not.toHaveBeenCalled();
  } finally {
    global.fetch = original;
    await executor.close();
  }
});
