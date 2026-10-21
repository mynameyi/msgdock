import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const container = process.env.TEST_CONTAINER ?? 'msgdock-qa';
assert(/^msgdock-(qa|ci)$/.test(container), 'Only disposable MsgDock test containers are allowed');
const state = JSON.parse(
  (await readFile(process.env.TEST_STATE_OUTPUT, 'utf8')).replace(/^\uFEFF/, ''),
);
const publicHeaders = {
  Authorization: `Bearer ${state.apiKey}`,
  'Content-Type': 'application/json',
};
async function notice(authorization = publicHeaders.Authorization) {
  const response = await fetch(`${state.base}/api/v1/notifications`, {
    method: 'POST',
    headers: { ...publicHeaders, Authorization: authorization },
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      target: { type: 'targets', ids: [state.channelShortId] },
      message: { text: 'queue recovery ' + randomUUID() },
    }),
  });
  assert.equal(response.status, 202);
  const data = (await response.json()).data;
  const result = await fetch(`${state.base}/api/v1/notifications/${data.notification_id}`, {
    headers: publicHeaders,
  });
  return { id: data.notification_id, delivery: (await result.json()).data.deliveries[0] };
}
async function deferred(authorization) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await notice(authorization);
    assert(/^[a-f0-9-]{36}$/.test(data.delivery.id));
    const sql = `UPDATE "Delivery" SET "nextAttemptAt"=(now() AT TIME ZONE 'UTC')+interval '8 seconds' WHERE id='${data.delivery.id}' AND status='pending' AND "attemptCount"=0 RETURNING id;`;
    const result = execFileSync(
      'docker',
      ['exec', '-u', 'postgres', container, 'psql', '-U', 'postgres', '-d', 'msgdock', '-tAc', sql],
      { encoding: 'utf8' },
    );
    if (result.includes(data.delivery.id)) return data;
  }
  throw new Error('Could not prepare a pending recovery fixture');
}
const recover = await deferred();
execFileSync('docker', ['exec', container, 'redis-cli', 'FLUSHALL'], { stdio: 'pipe' });
let recovered = false;
for (let n = 0; n < 50; n++) {
  const response = await fetch(`${state.base}/api/v1/notifications/${recover.id}`, {
    headers: publicHeaders,
  });
  const data = (await response.json()).data;
  if (data.deliveries[0].status === 'accepted') {
    assert.equal(data.deliveries[0].attemptCount, 1);
    recovered = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 300));
}
assert(recovered, 'Pending business delivery must recover after complete queue loss');
const cancelled = await deferred();
const cancelResponse = await fetch(
  `${state.base}/api/admin/deliveries/${cancelled.delivery.id}/cancel`,
  { method: 'POST', headers: { cookie: state.cookie, 'x-csrf-token': state.csrf } },
);
assert.equal(cancelResponse.status, 201);
await new Promise((r) => setTimeout(r, 9000));
const response = await fetch(`${state.base}/api/v1/notifications/${cancelled.id}`, {
  headers: publicHeaders,
});
const data = (await response.json()).data;
assert.equal(data.deliveries[0].status, 'cancelled');
assert.equal(data.deliveries[0].attemptCount, 0);
const unavailable = await deferred();
execFileSync(
  'docker',
  [
    'exec',
    '-u',
    'postgres',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'msgdock',
    '-tAc',
    `UPDATE "Delivery" SET "pluginVersion"='99.0.0',"nextAttemptAt"=(now() AT TIME ZONE 'UTC'),generation=generation+1 WHERE id='${unavailable.delivery.id}' AND status='pending';`,
  ],
  { stdio: 'pipe' },
);
let versionRejected = false;
for (let n = 0; n < 40; n++) {
  const result = await fetch(`${state.base}/api/v1/notifications/${unavailable.id}`, {
    headers: publicHeaders,
  });
  const notice = (await result.json()).data;
  if (notice.deliveries[0].status === 'failed') {
    assert.equal(notice.deliveries[0].error.code, 'CHANNEL_PLUGIN_UNAVAILABLE');
    assert.equal(notice.deliveries[0].error.source_code, 'plugin_unavailable');
    assert.equal(notice.deliveries[0].attemptCount, 0);
    versionRejected = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
assert(versionRejected, 'Missing pinned plugin must fail before sending');
const replay = await fetch(
  `${state.base}/api/admin/deliveries/${unavailable.delivery.id}/replays`,
  {
    method: 'POST',
    headers: {
      cookie: state.cookie,
      'x-csrf-token': state.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: '验证缺失插件不能改用当前版本重发', confirmed: true }),
  },
);
assert.equal(replay.status, 400);
const adminHeaders = {
  cookie: state.cookie,
  'x-csrf-token': state.csrf,
  'content-type': 'application/json',
};
const keyResponse = await fetch(state.base + '/api/admin/api-keys', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ name: '队列撤销验证' }),
});
assert.equal(keyResponse.status, 201);
const transientKey = (await keyResponse.json()).data;
const keyCancelled = await deferred('Bearer ' + transientKey.key);
const revoked = await fetch(state.base + '/api/admin/api-keys/' + transientKey.id + '/revoke', {
  method: 'POST',
  headers: adminHeaders,
  body: '{}',
});
assert.equal(revoked.status, 201);
let revokedBeforeSend = false;
for (let n = 0; n < 50; n++) {
  const response = await fetch(state.base + '/api/v1/notifications/' + keyCancelled.id, {
    headers: publicHeaders,
  });
  assert.equal(response.status, 200);
  const delivery = (await response.json()).data.deliveries[0];
  if (delivery.status === 'cancelled') {
    assert.equal(delivery.attemptCount, 0);
    revokedBeforeSend = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
assert(
  revokedBeforeSend,
  'Revoked credentials must cancel a queued delivery before platform dispatch',
);
const deniedReplay = await fetch(
  state.base + '/api/admin/deliveries/' + keyCancelled.delivery.id + '/replays',
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ reason: '验证已撤销 Key 的历史投递', confirmed: true }),
  },
);
assert.equal(deniedReplay.status, 409);
assert.equal((await deniedReplay.json()).code, 'DELIVERY_STATE_CONFLICT');
console.log(
  JSON.stringify({
    ok: true,
    verified: [
      'PostgreSQL authoritative delivery recovery after Redis FLUSHALL',
      'no duplicate platform attempt',
      'pending delivery cancellation',
      'cancelled generation does not send',
      'missing pinned plugin fails without a platform attempt',
      'replay never falls back to a different plugin version',
      'revoking a key cancels queued delivery before any platform attempt',
      'replay with a revoked source key reports conflict instead of invalidating admin login',
    ],
  }),
);
