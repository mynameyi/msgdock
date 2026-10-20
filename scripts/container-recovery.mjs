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
async function notice() {
  const response = await fetch(`${state.base}/api/v1/apps/${state.appKey}/notifications`, {
    method: 'POST',
    headers: { ...publicHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      event: 'recovery.verification',
      target: { type: 'targets', ids: [state.targetId] },
      message: { text: 'queue recovery ' + randomUUID() },
    }),
  });
  assert.equal(response.status, 202);
  const data = await response.json();
  const result = await fetch(
    `${state.base}/api/v1/apps/${state.appKey}/notifications/${data.notification_id}`,
    { headers: publicHeaders },
  );
  return { id: data.notification_id, delivery: (await result.json()).deliveries[0] };
}
async function deferred() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await notice();
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
  const response = await fetch(
    `${state.base}/api/v1/apps/${state.appKey}/notifications/${recover.id}`,
    { headers: publicHeaders },
  );
  const data = await response.json();
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
const response = await fetch(
  `${state.base}/api/v1/apps/${state.appKey}/notifications/${cancelled.id}`,
  { headers: publicHeaders },
);
const data = await response.json();
assert.equal(data.deliveries[0].status, 'cancelled');
assert.equal(data.deliveries[0].attemptCount, 0);
console.log(
  JSON.stringify({
    ok: true,
    verified: [
      'PostgreSQL authoritative delivery recovery after Redis FLUSHALL',
      'no duplicate platform attempt',
      'pending delivery cancellation',
      'cancelled generation does not send',
    ],
  }),
);
