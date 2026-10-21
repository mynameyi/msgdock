import { OpenAPIObject } from '@nestjs/swagger';
import { publicOpenApi } from '../src/public-openapi';
import document from '../../../docs/openapi.json';

describe('public developer contract', () => {
  const full = document as unknown as OpenAPIObject;
  const published = publicOpenApi(full);
  it('publishes only the four notification endpoints and Bearer auth', () => {
    expect(Object.keys(published.paths)).toHaveLength(4);
    expect(Object.keys(published.paths).every((p) => p.startsWith('/api/v1/apps/'))).toBe(true);
    expect(Object.keys(published.components!.securitySchemes!)).toEqual(['bearer']);
    expect(published.paths['/api/v1/apps/{appKey}/notifications']!.post!.security).toEqual([
      { bearer: [] },
      {},
    ]);
    for (const path of Object.values(published.paths)) {
      if (path?.get) expect(path.get.security).toEqual([{ bearer: [] }]);
    }
  });
  it('keeps every referenced schema, without exposing private or unused models', () => {
    const schemas = published.components!.schemas!;
    expect(schemas.NotificationDto).toBeDefined();
    for (const name of ['SetupDto', 'LoginDto', 'PasswordDto', 'ChannelDto', 'ApplicationDto'])
      expect(schemas[name]).toBeUndefined();
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const ref = (value as { $ref?: string }).$ref;
      if (ref) {
        expect(ref.startsWith('#/components/schemas/')).toBe(true);
        expect(schemas[ref.slice('#/components/schemas/'.length)]).toBeDefined();
      }
      Object.values(value).forEach(visit);
    };
    visit(published);
    expect(full.paths['/api/admin/applications']).toBeDefined();
    expect(full.components!.schemas!.LoginDto).toBeDefined();
  });
  it('describes the idempotency header once and provides usable exclusive message examples', () => {
    const post = published.paths['/api/v1/apps/{appKey}/notifications']!.post!;
    const headers = post.parameters!.filter((p) => 'in' in p && p.in === 'header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatchObject({ name: 'idempotency-key', required: true });
    const body = post.requestBody!;
    expect('content' in body).toBe(true);
    if ('content' in body) {
      const examples = body.content['application/json']!.examples!;
      expect(examples.text).toMatchObject({ value: { message: { text: '订单支付成功。' } } });
      expect(examples.template).toMatchObject({ value: { template: { key: 'order_paid' } } });
    }
  });
});
