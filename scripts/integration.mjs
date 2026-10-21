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
async function request(path, { method = 'GET', body, auth, idempotencyKey, headers = {} } = {}) {
  if (idempotencyKey !== undefined) body = { ...body, idempotency_key: idempotencyKey };
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
  const envelope = await response.json();
  assert.equal(typeof envelope.code, 'string');
  assert.equal(typeof envelope.message, 'string');
  assert.equal(envelope.request_id, response.headers.get('x-request-id'));
  if (response.ok) assert.equal(envelope.code, 'OK');
  else assert.equal(envelope.data, null);
  return { response, data: response.ok ? envelope.data : envelope, envelope };
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
async function waitForNotice(key, id, predicate) {
  for (let n = 0; n < 80; n++) {
    const result = expectStatus(
      await request(`/api/v1/notifications/${id}`, { auth: `Bearer ${key}` }),
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
      body: { name: '插件校验', enabled: true, ...body },
    }),
    400,
  );
expectStatus(
  await request('/api/admin/api-keys', {
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
      enabled: true,
      credentials: { webhookUrl: 'https://127.0.0.1/send' },
    },
  }),
  400,
);
const channelBody = {
  name: '集成测试渠道',
  type: 'mock',
  enabled: true,
  credentials: {},
  pluginVersion: '1.0.0',
  targetConfig: {},
};
const channel = await admin('/channels', channelBody);
const channels = expectStatus(await request('/api/admin/channels'), 200);
assert(!JSON.stringify(channels).includes('credentials'));
checks++;
const savedChannel = channels.find((c) => c.id === channel.id);
assert.equal(savedChannel.pluginVersion, '1.0.0');
assert.equal(savedChannel.configVersion, 1);
assert.match(savedChannel.shortId, /^ch_[0-9a-f]{12}$/);
assert.equal(channel.shortId, savedChannel.shortId);
assert.equal(new Set(channels.map((c) => c.shortId)).size, channels.length);
checks += 5;
const target = expectStatus(await request('/api/admin/targets'), 200).find(
  (t) => t.channelId === channel.id,
);
assert.equal(target.name, channelBody.name);
checks++;
const suffix = randomUUID().slice(0, 8);
const defaults = expectStatus(await request('/api/admin/api-settings'), 200);
assert.equal(defaults.authEnabled, true);
await admin('/api-settings', { authEnabled: true, perMinuteLimit: 2000 }, 'PUT');
checks++;
const topic = await admin('/topics', {
  name: '渠道重命名验证',
  key: `rename-${suffix}`,
  targetIds: [target.id],
});
const renamedChannel = await admin(
  `/channels/${channel.id}`,
  { ...channelBody, name: '集成测试通知群', targetName: '旧客户端名称不再生效' },
  'PUT',
);
assert.equal(renamedChannel.shortId, channel.shortId);
const renamedTargets = expectStatus(await request('/api/admin/targets'), 200).filter(
  (t) => t.channelId === channel.id,
);
assert.equal(renamedTargets.length, 1);
assert.equal(renamedTargets[0].id, target.id);
assert.equal(renamedTargets[0].name, '集成测试通知群');
assert.deepEqual(renamedTargets[0].config, target.config);
assert.equal(renamedTargets[0].channel.shortId, channel.shortId);
const savedTopic = expectStatus(await request('/api/admin/topics'), 200).find(
  (t) => t.id === topic.id,
);
assert.deepEqual(savedTopic.targetIds, [target.id]);
checks += 8;
const primaryKey = await admin('/api-keys', { name: '订单通知' });
const key = primaryKey.key;
const other = await admin('/api-keys', { name: '监控告警' });
const otherKey = other.key;
const endpoint = '/api/v1/notifications';
expectStatus(
  await request('/api/admin/api-keys', { auth: 'Bearer ' + key, headers: { cookie: '' } }),
  401,
);
const text = 'integration ' + suffix;
const payload = {
  target: { type: 'targets', ids: [channel.shortId] },
  message: { text },
};
const legacyOnly = await request(endpoint, {
  method: 'POST',
  body: payload,
  auth: `Bearer ${key}`,
  headers: { 'Idempotency-Key': 'legacy-only' },
});
const headerIgnored = expectStatus(legacyOnly, 202);
const headerRepeated = expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: `Bearer ${key}`,
    headers: { 'Idempotency-Key': 'legacy-only' },
  }),
  202,
);
assert.notEqual(headerIgnored.notification_id, headerRepeated.notification_id);
assert.equal(headerIgnored.idempotency_hit, false);
assert.equal(headerRepeated.idempotency_hit, false);
const unkeyed = await Promise.all(
  Array.from({ length: 4 }, () =>
    request(endpoint, {
      method: 'POST',
      body: payload,
      auth: `Bearer ${key}`,
    }),
  ),
);
const unkeyedResults = unkeyed.map((r) => expectStatus(r, 202));
assert.equal(new Set(unkeyedResults.map((r) => r.notification_id)).size, unkeyedResults.length);
assert(unkeyedResults.every((r) => r.delivery_count === 1 && r.idempotency_hit === false));
await waitForNotice(key, unkeyedResults[0].notification_id, (ds) =>
  ds.every((d) => d.status === 'accepted'),
);
for (const invalid of [null, '', 'with space', 12]) {
  const invalidKey = await request(endpoint, {
    method: 'POST',
    body: { ...payload, idempotency_key: invalid },
    auth: `Bearer ${key}`,
  });
  assert.equal(expectStatus(invalidKey, 400).code, 'VALIDATION_ERROR');
}
const retiredEvent = await request(endpoint, {
  method: 'POST',
  body: { ...payload, event: 'retired' },
  auth: `Bearer ${key}`,
  idempotencyKey: randomUUID(),
});
assert.equal(expectStatus(retiredEvent, 400).code, 'VALIDATION_ERROR');
const deniedTarget = await request(`/api/v1/notifications`, {
  method: 'POST',
  body: payload,
  auth: `Bearer ${otherKey}`,
  idempotencyKey: 'unauthorized-target',
});
expectStatus(deniedTarget, 202);
const missingChannel = await request(endpoint, {
  method: 'POST',
  body: { ...payload, target: { type: 'targets', ids: ['ch_000000000000'] } },
  auth: `Bearer ${key}`,
  idempotencyKey: randomUUID(),
});
assert.equal(expectStatus(missingChannel, 400).code, 'TARGET_UNAVAILABLE');
for (const refs of [
  ['ch_short'],
  [channel.id],
  [target.id],
  [channel.shortId, target.id],
  ['bad-id'],
]) {
  const invalidRef = await request(endpoint, {
    method: 'POST',
    body: { ...payload, target: { type: 'targets', ids: refs } },
    auth: `Bearer ${key}`,
    idempotencyKey: randomUUID(),
  });
  assert.equal(expectStatus(invalidRef, 400).code, 'VALIDATION_ERROR');
}
for (const refs of [[channel.shortId], [channel.shortId, channel.shortId]]) {
  const result = expectStatus(
    await request(endpoint, {
      method: 'POST',
      body: { ...payload, target: { type: 'targets', ids: refs } },
      auth: `Bearer ${key}`,
      idempotencyKey: randomUUID(),
    }),
    202,
  );
  assert.equal(result.delivery_count, 1);
  checks++;
}
const rejectedTest = await request('/api/admin/notifications/test', {
  method: 'POST',
  body: { targetIds: [target.id], text: 'UUID 不应触发测试发送' },
});
assert.equal(expectStatus(rejectedTest, 400).code, 'VALIDATION_ERROR');
const testNotice = await admin('/notifications/test', {
  targetIds: [channel.shortId],
  text: '渠道短 ID 测试发送',
});
assert.equal(testNotice.delivery_count, 1);
checks++;
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    idempotencyKey: 'missing-key',
  }),
  401,
);
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: `Bearer ${otherKey}`,
    idempotencyKey: 'second-key',
  }),
  202,
);
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: {},
    auth: `Bearer ${key}`,
    idempotencyKey: 'invalid-body',
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
      idempotencyKey: idem,
    }),
  ),
);
const accepted = repeated.map((r) => expectStatus(r, 202));
assert.equal(new Set(accepted.map((x) => x.notification_id)).size, 1);
checks++;
assert.equal(
  expectStatus(
    await request(endpoint, {
      method: 'POST',
      body: { ...payload, message: { text: 'different message' } },
      auth: `Bearer ${key}`,
      idempotencyKey: idem,
    }),
    409,
  ).code,
  'IDEMPOTENCY_CONFLICT',
);
const success = await waitForNotice(key, accepted[0].notification_id, (ds) =>
  ds.every((d) => d.status === 'accepted'),
);
assert.equal(success.deliveries.length, 1);
assert.equal(success.deliveries[0].attemptCount, 1);
assert.equal(success.deliveries[0].error, null);
assert.equal(Object.hasOwn(success, 'event'), false);
checks += 2;
expectStatus(
  await request(`/api/v1/notifications/${success.id}`, {
    auth: `Bearer ${otherKey}`,
  }),
  200,
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
      idempotencyKey: randomUUID(),
    }),
    202,
  );
const failed = await send('mock:failed ' + suffix);
const failureResult = await waitForNotice(
  key,
  failed.notification_id,
  (ds) => ds[0].status === 'failed',
);
assert.equal(failureResult.deliveries[0].error.code, 'DELIVERY_FAILED');
assert.equal(typeof failureResult.deliveries[0].error.source_code, 'string');
const uncertain = await send('mock:unknown ' + suffix);
const unknown = await waitForNotice(
  key,
  uncertain.notification_id,
  (ds) => ds[0].status === 'unknown',
);
assert.equal(unknown.deliveries[0].error.code, 'DELIVERY_RESULT_UNKNOWN');
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
      target: { type: 'topic', key: `finance_${suffix.replaceAll('-', '')}` },
      template: { key: template.key },
      variables: { order_no: 'NO-001', amount: 299 },
    },
    auth: `Bearer ${key}`,
    idempotencyKey: randomUUID(),
  }),
  202,
);
const templatedNotice = await waitForNotice(
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
await admin('/api-settings', { authEnabled: false, perMinuteLimit: 2000 }, 'PUT');
const anonymousResults = await Promise.all(
  Array.from({ length: 2 }, () => request(endpoint, { method: 'POST', body: payload })),
);
const anonymousNotices = anonymousResults.map((r) => expectStatus(r, 202));
assert.notEqual(anonymousNotices[0].notification_id, anonymousNotices[1].notification_id);
assert(anonymousNotices.every((n) => n.idempotency_hit === false));
checks += 2;
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: 'Bearer invalid',
    idempotencyKey: randomUUID(),
  }),
  401,
);
expectStatus(await request(`/api/v1/notifications/${success.id}`), 200);
await admin('/api-settings', { authEnabled: true, perMinuteLimit: 2000 }, 'PUT');
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    idempotencyKey: randomUUID(),
  }),
  401,
);
const rotate = await admin('/api-keys', { name: '轮换测试' });
await admin(`/api-keys/${rotate.id}/revoke`, {});
expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: `Bearer ${rotate.key}`,
    idempotencyKey: randomUUID(),
  }),
  401,
);
const keyList = expectStatus(await request('/api/admin/api-keys'), 200);
assert.equal(keyList.find((k) => k.id === primaryKey.id).key, key);
assert(!JSON.stringify(keyList).includes('"secret"'));
assert(!JSON.stringify(keyList).includes('hash'));
checks += 2;
await admin('/api-keys/' + other.id, { name: '已停用的 Key', enabled: false }, 'PUT');
assert.equal(
  expectStatus(
    await request(endpoint, { method: 'POST', body: payload, auth: 'Bearer ' + otherKey }),
    401,
  ).code,
  'API_KEY_INVALID',
);
await admin('/api-keys/' + other.id, { name: '重新启用的 Key', enabled: true }, 'PUT');
const separateKeyResult = expectStatus(
  await request(endpoint, {
    method: 'POST',
    body: payload,
    auth: 'Bearer ' + otherKey,
    idempotencyKey: idem,
  }),
  202,
);
assert.notEqual(separateKeyResult.notification_id, accepted[0].notification_id);
await admin('/api-settings', { authEnabled: true, perMinuteLimit: 1 }, 'PUT');
const limitedResponses = await Promise.all(
  [key, otherKey].map((k) =>
    request(endpoint, { method: 'POST', body: payload, auth: 'Bearer ' + k }),
  ),
);
assert(limitedResponses.some((r) => r.response.status === 429 && r.data.code === 'RATE_LIMITED'));
await admin('/api-settings', { authEnabled: true, perMinuteLimit: 2000 }, 'PUT');
expectStatus(await request('/api/admin/applications'), 404);
checks += 2;
const overview = expectStatus(await request('/api/admin/overview'), 200);
assert(overview.total >= 6);
assert(overview.recent.every((d) => !Object.hasOwn(d.notification, 'event')));
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
      apiKeyId: primaryKey.id,
      targetId: target.id,
      channelShortId: channel.shortId,
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
      'standalone keys and global authentication switch',
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
      'stable unique channel short IDs and UUID rejection',
      'short-ID authorization, deduplication and console test sends',
      'event-free sending, queries and retired-field rejection',
      'optional idempotency: repeated unkeyed requests create distinct notifications',
      'provided-key validation and ignored legacy header',
    ],
  }),
);
