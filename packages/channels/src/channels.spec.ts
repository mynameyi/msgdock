import { createHmac } from 'node:crypto';
import { feishuSignature, sendMessage, validateCredentials } from './index';
describe('渠道协议与出站边界', () => {
  test('Webhook 限定平台域名、协议及接口路径', () => {
    expect(() =>
      validateCredentials('wecom.group_webhook', {
        webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret',
      }),
    ).not.toThrow();
    for (const url of [
      'http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x',
      'https://127.0.0.1/send',
      'https://qyapi.weixin.qq.com.evil.test/cgi-bin/webhook/send?key=x',
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x&other=x',
    ])
      expect(() => validateCredentials('wecom.group_webhook', { webhookUrl: url })).toThrow();
  });
  test('飞书签名使用 timestamp 换行 secret 作为 HMAC key', () => {
    expect(feishuSignature('1700000000', 'secret')).toBe(
      createHmac('sha256', '1700000000\nsecret').update('').digest('base64'),
    );
  });
  test('HTTP 200 仍检查业务错误；网络不确定不得当作普通失败重试', async () => {
    const original = global.fetch;
    const beforeRequest = jest.fn(async () => {});
    try {
      global.fetch = jest.fn(
        async () => new Response(JSON.stringify({ errcode: 40058 }), { status: 200 }),
      );
      const context = {
        type: 'wecom.group_webhook' as const,
        credentials: { webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x' },
        target: {},
        text: 'hello',
        beforeRequest,
      };
      expect((await sendMessage(context)).kind).toBe('failed');
      expect(beforeRequest).toHaveBeenCalledTimes(1);
      global.fetch = jest.fn(async () => {
        throw new Error('timeout');
      });
      expect((await sendMessage(context)).kind).toBe('unknown');
      global.fetch = jest.fn(
        async () => new Response('{}', { status: 429, headers: { 'retry-after': '8' } }),
      );
      expect(await sendMessage(context)).toMatchObject({ kind: 'retry', retryAfterMs: 8000 });
    } finally {
      global.fetch = original;
    }
  });
});
