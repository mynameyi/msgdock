import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3301';
for (const path of [
  '/',
  '/docs',
  '/docs/plugins',
  '/docs/swagger',
  '/docs/redoc',
  '/docs/responses',
  '/console',
  '/console/channels',
]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /text\/html/, path);
}
const response = await fetch(base + '/openapi.json');
assert.equal(response.status, 200);
const spec = await response.json();
assert.equal(Object.keys(spec.paths).length, 4);
assert.ok(Object.keys(spec.paths).every((p) => p.startsWith('/api/v1/apps/')));
assert.deepEqual(Object.keys(spec.components.securitySchemes), ['bearer']);
for (const schema of ['LoginDto', 'SetupDto', 'PasswordDto', 'ChannelDto', 'ApplicationDto'])
  assert.equal(spec.components.schemas[schema], undefined);
assert.ok(spec.components.schemas.NotificationDto);
assert.ok(spec.components.schemas.NotificationResultDto);
assert.ok(spec.components.schemas.NotificationDto.required.includes('idempotency_key'));
assert.equal(spec.components.schemas.TargetDto.properties.ids.items.pattern, '^ch_[0-9a-f]{12}$');
assert(!JSON.stringify(spec).includes('"event"'));
const post = spec.paths['/api/v1/apps/{appKey}/notifications'].post;
assert.ok(
  !post.parameters.some(
    (parameter) => parameter.in === 'header' && parameter.name.toLowerCase() === 'idempotency-key',
  ),
);
assert.equal(
  post.responses['202'].content['application/json'].schema.properties.code.enum[0],
  'OK',
);
assert.equal((await fetch(base + '/api/admin/applications')).status, 401);
assert.equal(
  (await fetch(base + '/api/v1/apps/missing/notifications/00000000-0000-4000-8000-000000000001'))
    .status,
  401,
);
console.log('Public page routes, notification contract and admin authentication verified.');
