import { ChannelPlugin, ConfigValues } from '@msgdock/plugin-sdk';
import { wecomWebhook } from '@msgdock/plugin-wecom-webhook';
import { ChannelExecutor, ChannelRegistry, createBuiltinRegistry } from './index';

const credentials = { webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret' };
function fixture(version = '1.0.0'): ChannelPlugin {
  return {
    ...wecomWebhook,
    descriptor: {
      ...structuredClone(wecomWebhook.descriptor),
      id: 'example.text',
      version,
      name: '示例插件',
    },
  };
}
const input = (overrides: Record<string, unknown> = {}) => ({
  channelId: 'test-channel',
  pluginId: 'wecom.group_webhook',
  pluginVersion: '1.0.0',
  configVersion: 1,
  credentials,
  target: {},
  text: 'hello',
  beforeRequest: jest.fn(async () => {}),
  ...overrides,
});

describe('插件注册与动态契约', () => {
  test('生产目录只有官方插件，测试插件必须显式注册', () => {
    expect(
      createBuiltinRegistry()
        .list()
        .map((p) => p.id),
    ).toEqual(['wecom.group_webhook', 'feishu.group_webhook', 'dingtalk.enterprise_bot']);
    expect(() => createBuiltinRegistry().get('mock')).toThrow();
    expect(
      createBuiltinRegistry({ testEndpoint: 'http://localhost:3320/send' }).get('mock').descriptor
        .testOnly,
    ).toBe(true);
    expect(() => createBuiltinRegistry({ testEndpoint: 'http://evil.test/send' })).toThrow();
  });
  test('新插件仅需注册；精确版本保留，重复和不兼容 SDK 拒绝启动', () => {
    const registry = new ChannelRegistry().register(fixture()).register(fixture('2.0.0'));
    expect(registry.get('example.text').descriptor.version).toBe('2.0.0');
    expect(registry.get('example.text', '1.0.0').descriptor.version).toBe('1.0.0');
    expect(() => registry.get('example.text', '9.0.0')).toThrow();
    expect(() => registry.register(fixture())).toThrow('重复');
    const incompatible = fixture('3.0.0');
    incompatible.descriptor.sdkApiVersion = 2;
    expect(() => registry.register(incompatible)).toThrow('不兼容');
  });
  test('插件 Schema 校验配置、目标、额外字段；错误不包含凭证值', () => {
    const registry = createBuiltinRegistry();
    expect(() => registry.validate('wecom.group_webhook', '1.0.0', credentials, {})).not.toThrow();
    for (const [config, target] of [
      [{}, {}],
      [{ webhookUrl: 123 }, {}],
      [{ ...credentials, extra: 'secret-value' }, {}],
      [credentials, { unexpected: 'x' }],
    ])
      expect(() =>
        registry.validate(
          'wecom.group_webhook',
          '1.0.0',
          config as ConfigValues,
          target as ConfigValues,
        ),
      ).toThrow();
    expect(() =>
      registry.validate(
        'dingtalk.enterprise_bot',
        '1.0.0',
        {
          appKey: 'k',
          appSecret: 'private-secret-value',
          robotCode: 'r',
        },
        {},
      ),
    ).toThrow('接收目标');
    try {
      registry.validate('wecom.group_webhook', '1.0.0', { webhookUrl: 123456789 }, {});
    } catch (error) {
      expect(String(error)).not.toContain('123456789');
    }
  });
  test('Webhook 限定平台域名、协议及接口路径', () => {
    const registry = createBuiltinRegistry();
    for (const webhookUrl of [
      'http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x',
      'https://127.0.0.1/send',
      'https://qyapi.weixin.qq.com.evil.test/cgi-bin/webhook/send?key=x',
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x&other=x',
    ])
      expect(() => registry.validate('wecom.group_webhook', '1.0.0', { webhookUrl }, {})).toThrow();
  });
});

describe('宿主执行边界与版本固定', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  test('只有发送请求触发持久化标记，HTTP 200 仍检查平台业务错误', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ errcode: 40058 })));
    const executor = new ChannelExecutor(createBuiltinRegistry());
    const request = input();
    expect((await executor.execute(request)).kind).toBe('failed');
    expect(request.beforeRequest).toHaveBeenCalledTimes(1);
    await executor.close();
  });
  test('开始请求后网络异常为 unknown；429 返回平台等待时间', async () => {
    const executor = new ChannelExecutor(createBuiltinRegistry());
    global.fetch = jest.fn(async () => {
      throw new Error('timeout with secret');
    });
    expect(await executor.execute(input())).toMatchObject({
      kind: 'unknown',
      code: 'network_uncertain',
    });
    global.fetch = jest.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '8' } }),
    );
    expect(await executor.execute(input())).toMatchObject({ kind: 'retry', retryAfterMs: 8000 });
    global.fetch = jest.fn(async () => new Response('{}'));
    expect(await executor.execute(input())).toMatchObject({
      kind: 'unknown',
      code: 'invalid_response',
    });
    await executor.close();
  });
  test('不可用版本、配置版本不符或超限消息不会发出请求', async () => {
    global.fetch = jest.fn();
    const executor = new ChannelExecutor(createBuiltinRegistry());
    for (const request of [
      input({ pluginVersion: '9.0.0' }),
      input({ configVersion: 2 }),
      input({ text: '字'.repeat(1000) }),
    ])
      expect((await executor.execute(request)).kind).toBe('failed');
    expect(global.fetch).not.toHaveBeenCalled();
    await executor.close();
  });
  test('固定旧版本执行，生命周期复用，凭证变更和关闭释放适配器', async () => {
    const starts = jest.fn(async () => {}),
      stops = jest.fn(async () => {});
    const versions: string[] = [];
    const registry = new ChannelRegistry();
    for (const version of ['1.0.0', '2.0.0']) {
      const plugin = fixture(version);
      plugin.create = () => ({
        start: starts,
        stop: stops,
        async send({ http }) {
          versions.push(version);
          await http.post({ url: String(credentials.webhookUrl), body: {}, purpose: 'delivery' });
          return { kind: 'accepted' };
        },
      });
      registry.register(plugin);
    }
    global.fetch = jest.fn(async () => new Response('{}'));
    const executor = new ChannelExecutor(registry);
    await Promise.all([
      executor.execute(input({ pluginId: 'example.text' })),
      executor.execute(input({ pluginId: 'example.text' })),
    ]);
    expect(starts).toHaveBeenCalledTimes(1);
    expect(versions).toEqual(['1.0.0', '1.0.0']);
    await executor.execute(
      input({
        pluginId: 'example.text',
        credentials: { webhookUrl: credentials.webhookUrl + 'new' },
      }),
    );
    expect(starts).toHaveBeenCalledTimes(2);
    expect(stops).toHaveBeenCalledTimes(1);
    await executor.close();
    expect(stops).toHaveBeenCalledTimes(2);
  });
  test('宿主阻止跨域请求；发送标记失败时不触达平台', async () => {
    global.fetch = jest.fn(async () => new Response('{}'));
    const plugin = fixture();
    plugin.create = () => ({
      async send({ http }) {
        await http.post({ url: 'https://evil.test/send', body: {}, purpose: 'delivery' });
        return { kind: 'accepted' };
      },
    });
    const executor = new ChannelExecutor(new ChannelRegistry().register(plugin));
    const request = input({ pluginId: 'example.text' });
    expect((await executor.execute(request)).kind).toBe('failed');
    expect(request.beforeRequest).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    await executor.close();
    const official = new ChannelExecutor(createBuiltinRegistry());
    expect(
      (
        await official.execute(
          input({
            beforeRequest: async () => {
              throw new Error('lease lost');
            },
          }),
        )
      ).kind,
    ).toBe('failed');
    expect(global.fetch).not.toHaveBeenCalled();
    await official.close();
  });
  test('一次尝试禁止第二次消息请求，拒绝未经发送就声称接受', async () => {
    global.fetch = jest.fn(async () => new Response('{}'));
    const plugin = fixture();
    plugin.create = () => ({
      async send({ http }) {
        for (let n = 0; n < 2; n++)
          await http.post({ url: credentials.webhookUrl, body: {}, purpose: 'delivery' });
        return { kind: 'accepted' };
      },
    });
    const executor = new ChannelExecutor(new ChannelRegistry().register(plugin));
    expect((await executor.execute(input({ pluginId: 'example.text' }))).kind).toBe('unknown');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await executor.close();
    const fake = fixture();
    fake.create = () => ({
      async send() {
        return { kind: 'accepted' };
      },
    });
    const fakeExecutor = new ChannelExecutor(new ChannelRegistry().register(fake));
    expect(await fakeExecutor.execute(input({ pluginId: 'example.text' }))).toMatchObject({
      code: 'plugin_protocol_error',
    });
    await fakeExecutor.close();
  });
  test('插件并发发出两个消息请求时只允许一个，并等待其结果后标记 unknown', async () => {
    global.fetch = jest.fn(async () => new Response('{}'));
    const plugin = fixture();
    plugin.create = () => ({
      async send({ http }) {
        await Promise.all(
          [1, 2].map(() =>
            http.post({ url: credentials.webhookUrl, body: {}, purpose: 'delivery' }),
          ),
        );
        return { kind: 'accepted' };
      },
    });
    const executor = new ChannelExecutor(new ChannelRegistry().register(plugin));
    expect(
      (
        await executor.execute(
          input({
            pluginId: 'example.text',
            beforeRequest: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
            },
          }),
        )
      ).kind,
    ).toBe('unknown');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await executor.close();
  });
});
