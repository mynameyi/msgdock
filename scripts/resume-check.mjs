import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const state = JSON.parse(
  (await readFile(process.env.TEST_STATE_OUTPUT, 'utf8')).replace(/^\uFEFF/, ''),
);
let response = await fetch(state.base + '/api/admin/session', {
  headers: { cookie: state.cookie },
});
assert.equal(response.status, 200, 'session persisted');
const keysResponse = await fetch(state.base + '/api/admin/api-keys', {
  headers: { cookie: state.cookie },
});
assert.equal(keysResponse.status, 200);
const keysAfterRestart = (await keysResponse.json()).data;
assert.equal(keysAfterRestart.find((k) => k.id === state.apiKeyId).key, state.apiKey);
assert(!JSON.stringify(keysAfterRestart).includes('"secret"'));

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${state.apiKey}`,
};
response = await fetch(`${state.base}/api/v1/notifications`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    idempotency_key: randomUUID(),
    target: { type: 'targets', ids: [state.channelShortId] },
    message: { text: 'container restart verification ' + randomUUID() },
  }),
});
assert.equal(response.status, 202);
const notification = (await response.json()).data;
for (let attempt = 0; attempt < 40; attempt++) {
  response = await fetch(`${state.base}/api/v1/notifications/${notification.notification_id}`, {
    headers: { Authorization: `Bearer ${state.apiKey}` },
  });
  assert.equal(response.status, 200);
  const notice = (await response.json()).data;
  if (notice.deliveries[0].status === 'accepted') {
    assert.equal(notice.deliveries[0].attemptCount, 1);
    console.log(
      JSON.stringify({
        ok: true,
        verified: [
          'persistent session',
          'persistent API Key and authorization',
          'complete API key readable after restart',
          'credential decryption after restart',
          'queue and worker resume',
          'single platform acceptance',
        ],
      }),
    );
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 300));
}
throw new Error('Post-restart delivery was not accepted');
