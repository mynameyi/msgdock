import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3302';
const local = process.env.TEST_SETUP_TOKEN
  ? null
  : JSON.parse(
      (await readFile(new URL('../../msgdock-dev-env.json', import.meta.url), 'utf8')).replace(
        /^\uFEFF/,
        '',
      ),
    );
const setupToken = process.env.TEST_SETUP_TOKEN ?? local.MSGDOCK_SETUP_TOKEN;
let cookie = '',
  csrf = '';
let checks = 0;
async function request(path, { method = 'GET', body, auth, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(auth ? { authorization: auth } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { response, data };
}
const expectStatus = (result, expected) => {
  assert.equal(result.response.status, expected, JSON.stringify(result.data));
  checks++;
  return result.data;
};
async function admin(path, body, method = 'POST') {
  return expectStatus(
    await request('/api/admin' + path, { method, body }),
    method === 'PUT' ? 200 : 201,
  );
}
async function waitForNotice(appKey, key, id, predicate) {
  for (let n = 0; n < 80; n++) {
    const result = expectStatus(
      await request(`/api/v1/apps/${appKey}/notifications/${id}`, { auth: `Bearer ${key}` }),
      200,
    );
    if (predicate(result.deliveries)) return result;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Delivery state timeout');
}
const bootstrap = expectStatus(await request('/api/admin/bootstrap'), 200);
const identity = await request(bootstrap.needsSetup ? '/api/admin/setup' : '/api/admin/login', {
  method: 'POST',
  body: {
    username: 'integration-admin',
    password: 'TestOnly-Password-2026!',
    ...(bootstrap.needsSetup ? { setupToken } : {}),
  },
});
expectStatus(identity, 201);
cookie = identity.response.headers.get('set-cookie').split(';')[0];
csrf = identity.data.csrfToken;
const plugins = expectStatus(await request('/api/admin/channel-plugins'), 200);
assert.equal(plugins.filter((p) => !p.testOnly).length, 3);
assert(plugins.every((p) => p.sdkApiVersion === 1 && p.configVersion === 1));
assert(
  plugins
    .find((p) => p.id === 'dingtalk.enterprise_bot')
    .targetSchema.required.includes('openConversationId'),
);
assert(!JSON.stringify(plugins).includes('accessToken'));
checks += 4;
for (const body of [
  { type: 'not.installed', credentials: {}, targetConfig: {} },
  { type: 'wecom.group_webhook', pluginVersion: '99.0.0', credentials: {}, targetConfig: {} },
  {
    type: 'dingtalk.enterprise_bot',
    credentials: { appKey: 'x', appSecret: 'x', robotCode: 'x' },
    targetConfig: {},
  },
  {
    type: 'wecom.group_webhook',
    credentials: {
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture',
      extra: 'secret-fixture',
    },
    targetConfig: {},
  },
])
  expectStatus(
    await request('/api/admin/channels', {
      method: 'POST',
      body: { name: '插件校验', enabled: true, targetName: '无发送校验目标', ...body },
    }),
    400,
  );
expectStatus(
  await request('/api/admin/applications', {
    method: 'POST',
    body: {},
    headers: { 'x-csrf-token': 'bad' },
  }),
  403,
);
expectStatus(
  await request('/api/admin/login', {
    method: 'POST',
    headers: { origin: 'https://evil.invalid' },
    body: { username: 'integration-admin', password: 'TestOnly-Password-2026!' },
  }),
  403,
);
expectStatus(
  await request('/api/admin/channels', {
    method: 'POST',
    body: {
      name: 'bad',
      type: 'wecom.group_webhook',
      targetName: 'bad',
      enabled: true,
      credentials: { webhookUrl: 'https://127.0.0.1/send' },
    },
  }),
  400,
);
const channel = await admin('/channels', {
  name: '集成测试渠道',
  type: 'mock',
  targetName: '测试接收目标',
  enabled: true,
  credentials: {},
  pluginVersion: '1.0.0',
  targetConfig: {},
});
const channels = expectStatus(await request('/api/admin/channels'), 200);
assert(!JSON.stringify(channels).includes('credentials'));
checks++;
const savedChannel = channels.find((c) => c.id === channel.id);
assert.equal(savedChannel.pluginVersion, '1.0.0');
assert.equal(savedChannel.configVersion, 1);
checks += 2;
const target = expectStatus(await request('/api/admin/targets'), 200).find(
  (t) => t.channelId === channel.id,
);
const suffix = randomUUID().slice(0, 8);
const appBody = {
  name: '订单服务',
  key: `orders-${suffix}`,
  enabled: true,
  allowedTargetIds: [target.id],
  perMinuteLimit: 200,
};
const app = await admin('/applications', appBody);
assert.equal(app.authMode, 'api_key');
checks++;
const other = await admin('/applications', {
  ...appBody,
  name: '另一应用',
  key: `other-${suffix}`,
});
const key = (await admin(`/applications/${app.id}/keys`)).key;
const otherKey = (await admin(`/applications/${other.id}/keys`)).key;
const endpoint = `/api/v1/apps/${app.key}/notifications`;
const text = 'integration ' + suffix;
const payload = {
  event: 'order.paid',
  target: { type: 'targets', ids: [target.id] },
  message: { text },
};
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    headers: { 'idempotency-key': 'missing-key' },
  }),
  401,
);
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: `Bearer ${otherKey}`,
    headers: { 'idempotency-key': 'cross-app' },
  }),
  403,
);
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: { event: 'bad' },
    auth: `Bearer ${key}`,
    headers: { 'idempotency-key': 'invalid-body' },
  }),
  400,
);
const idem = 'same-' + randomUUID();
const repeated = await Promise.all(
  Array.from({ length: 12 }, () =>
    request(endpoint, {
      method: 'POST',
      body: payload,
      auth: `Bearer ${key}`,
      headers: { 'idempotency-key': idem },
    }),
  ),
);
const accepted = repeated.map((r) => expectStatus(r, 202));
assert.equal(new Set(accepted.map((x) => x.notification_id)).size, 1);
checks++;
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: { ...payload, event: 'different' },
    auth: `Bearer ${key}`,
    headers: { 'idempotency-key': idem },
  }),
  409,
);
const success = await waitForNotice(app.key, key, accepted[0].notification_id, (ds) =>
  ds.every((d) => d.status === 'accepted'),
);
assert.equal(success.deliveries.length, 1);
assert.equal(success.deliveries[0].attemptCount, 1);
checks += 2;
expectStatus(
  await request(`/api/v1/apps/${other.key}/notifications/${success.id}`, {
    auth: `Bearer ${otherKey}`,
  }),
  404,
);
expectStatus(
  await request(`/api/admin/deliveries/${success.deliveries[0].id}/cancel`, { method: 'POST' }),
  409,
);
const send = async (text) =>
  expectStatus(
    await request(endpoint, {
      method: 'POST',
      body: { ...payload, message: { text } },
      auth: `Bearer ${key}`,
      headers: { 'idempotency-key': randomUUID() },
    }),
    202,
  );
const failed = await send('mock:failed ' + suffix);
await waitForNotice(app.key, key, failed.notification_id, (ds) => ds[0].status === 'failed');
const uncertain = await send('mock:unknown ' + suffix);
const unknown = await waitForNotice(
  app.key,
  key,
  uncertain.notification_id,
  (ds) => ds[0].status === 'unknown',
);
expectStatus(
  await request(`/api/admin/deliveries/${unknown.deliveries[0].id}/replays`, {
    method: 'POST',
    body: { reason: '未确认风险', confirmed: false },
  }),
  400,
);
await admin(`/deliveries/${unknown.deliveries[0].id}/resolve`, {
  reason: '集成测试已核实平台接受',
  confirmed: true,
});
const retry = await send('mock:retry ' + suffix);
const retried = await waitForNotice(
  app.key,
  key,
  retry.notification_id,
  (ds) => ds[0].status === 'accepted',
);
assert.equal(retried.deliveries[0].attemptCount, 2);
checks++;
const template = await admin('/templates', {
  name: '订单提醒',
  key: `template_${suffix.replaceAll('-', '')}`,
  body: '订单 {{order_no}}：{{amount}}',
});
await admin('/topics', {
  name: '财务通知',
  key: `finance_${suffix.replaceAll('-', '')}`,
  targetIds: [target.id],
});
const templated = expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: {
      event: 'template.test',
      target: { type: 'topic', key: `finance_${suffix.replaceAll('-', '')}` },
      template: { key: template.key },
      variables: { order_no: 'NO-001', amount: 299 },
    },
    auth: `Bearer ${key}`,
    headers: { 'idempotency-key': randomUUID() },
  }),
  202,
);
const templatedNotice = await waitForNotice(
  app.key,
  key,
  templated.notification_id,
  (ds) => ds[0].status === 'accepted',
);
await admin(
  `/templates/${template.id}`,
  { name: '订单提醒', key: template.key, body: '新版本 {{order_no}}' },
  'PUT',
);
const snapshot = expectStatus(
  await request(`/api/admin/deliveries/${templatedNotice.deliveries[0].id}`),
  200,
);
assert.equal(snapshot.text, '订单 NO-001：299');
assert.equal(snapshot.pluginId, 'mock');
assert.equal(snapshot.pluginVersion, '1.0.0');
assert.equal(snapshot.configVersion, 1);
checks += 3;
checks++;
await admin(`/applications/${app.id}`, { ...appBody, authMode: 'none' }, 'PUT');
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    headers: { 'idempotency-key': randomUUID() },
  }),
  202,
);
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: 'Bearer invalid',
    headers: { 'idempotency-key': randomUUID() },
  }),
  401,
);
expectStatus(await request(`/api/v1/apps/${app.key}/notifications/${success.id}`), 401);
await admin(`/applications/${app.id}`, { ...appBody, authMode: 'api_key' }, 'PUT');
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    headers: { 'idempotency-key': randomUUID() },
  }),
  401,
);
const rotate = await admin(`/applications/${app.id}/keys`);
await admin(`/applications/${app.id}/keys/${rotate.id}/revoke`, {});
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: `Bearer ${rotate.key}`,
    headers: { 'idempotency-key': randomUUID() },
  }),
  401,
);
const appList = expectStatus(await request('/api/admin/applications'), 200);
assert(!JSON.stringify(appList).includes(key));
assert(!JSON.stringify(appList).includes('hash'));
checks += 2;
const overview = expectStatus(await request('/api/admin/overview'), 200);
assert(overview.total >= 6);
checks++;
const system = expectStatus(await request('/api/admin/system'), 200);
assert(system.workerReady && system.redisReady);
checks++;
if (process.env.TEST_STATE_OUTPUT)
  await writeFile(
    process.env.TEST_STATE_OUTPUT,
    JSON.stringify({
      base,
      username: 'integration-admin',
      password: 'TestOnly-Password-2026!',
      appKey: app.key,
      applicationId: app.id,
      targetId: target.id,
      apiKey: key,
      cookie,
      csrf,
    }),
  );
console.log(
  JSON.stringify({
    ok: true,
    checks,
    verified: [
      'setup/login/CSRF',
      'default Bearer auth',
      'explicit anonymous send',
      'no auth downgrade',
      'application isolation',
      'concurrent idempotency',
      'platform errors',
      'unknown result protection',
      'bounded retry',
      'immutable template snapshots',
      'API key revoke',
      'credential redaction',
      'overview and worker heartbeat',
      'plugin catalog and schema validation',
      'pinned plugin and configuration versions',
    ],
  }),
);
