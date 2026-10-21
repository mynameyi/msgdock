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
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${state.apiKey}`,
};
response = await fetch(`${state.base}/api/v1/apps/${state.appKey}/notifications`, {
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
  response = await fetch(
    `${state.base}/api/v1/apps/${state.appKey}/notifications/${notification.notification_id}`,
    { headers: { Authorization: `Bearer ${state.apiKey}` } },
  );
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
