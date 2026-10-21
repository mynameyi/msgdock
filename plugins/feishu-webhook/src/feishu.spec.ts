import { createHmac } from 'node:crypto';
import { feishuSignature, feishuWebhook } from './index';
test('飞书使用 timestamp 换行 secret 签名，配置和文本序列化正确', async () => {
  const timestamp = '1700000000';
  expect(feishuSignature(timestamp, 'secret')).toBe(
    createHmac('sha256', `${timestamp}\nsecret`).update('').digest('base64'),
  );
  const post = jest.fn(async () => new Response(JSON.stringify({ code: 0 })));
  const adapter = feishuWebhook.create(
    { now: () => 1700000000000 },
    { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/id', secret: 'secret' },
  );
  expect((await adapter.send({ text: '你好', target: {}, http: { post } })).kind).toBe('accepted');
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      purpose: 'delivery',
      body: {
        msg_type: 'text',
        content: { text: '你好' },
        timestamp,
        sign: feishuSignature(timestamp, 'secret'),
      },
    }),
  );
});
