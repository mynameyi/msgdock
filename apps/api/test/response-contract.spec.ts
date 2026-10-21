import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NotificationsService, ServiceError } from '@msgdock/server';
import { NotificationsController } from '../src/http/notifications.controller';
import { configureResponseContract, errorResponse } from '../src/http/response-contract';

const service = {
  authenticate: jest.fn(async () => ({ id: 'app-id' })),
  accept: jest.fn(async () => ({
    notification_id: 'notice-id',
    status: 'accepted_for_processing',
  })),
};
@Controller('api/fixture')
class FixtureController {
  @Get('failed-delivery') query() {
    return { deliveries: [{ status: 'failed', error: { code: 'DELIVERY_FAILED' } }] };
  }
  @Get('conflict') conflict() {
    throw new ServiceError('IDEMPOTENCY_CONFLICT');
  }
  @Get('exception') fail() {
    throw new Error('secret-database-password');
  }
}
@Module({
  controllers: [NotificationsController, FixtureController],
  providers: [{ provide: NotificationsService, useValue: service }],
})
class FixtureModule {}

describe('HTTP response and request contract', () => {
  let app: NestFastifyApplication;
  const url = '/api/v1/apps/order-service/notifications';
  const body = {
    idempotency_key: 'business-event-001',
    target: { type: 'targets', ids: ['ch_a7c92e4f6b18'] },
    message: { text: 'hello' },
  };
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      FixtureModule,
      new FastifyAdapter({ bodyLimit: 2048 }),
      { logger: false },
    );
    configureResponseContract(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    service.accept.mockClear();
  });
  it('accepts the JSON idempotency key and wraps HTTP 202 without changing the business input', async () => {
    const response = await app.inject({
      method: 'POST',
      url,
      payload: body,
      headers: { authorization: 'Bearer fixture' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      code: 'OK',
      data: { notification_id: 'notice-id', status: 'accepted_for_processing' },
      request_id: expect.any(String),
    });
    const { idempotency_key, ...input } = body;
    expect(service.accept).toHaveBeenCalledWith('app-id', input, idempotency_key);
    expect(response.headers['x-request-id']).toBe(response.json().request_id);
    expect(response.json().notification_id).toBeUndefined();
  });
  it('rejects a header-only key and invalid JSON values with structured validation details', async () => {
    const { idempotency_key: _key, ...input } = body;
    for (const payload of [
      input,
      { ...input, idempotency_key: '' },
      { ...input, idempotency_key: 12 },
      { ...input, idempotency_key: 'with space' },
      { ...input, idempotency_key: 'x'.repeat(201) },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload,
        headers: { 'idempotency-key': 'legacy-key' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        data: null,
        details: expect.arrayContaining([expect.objectContaining({ field: 'idempotency_key' })]),
      });
    }
    expect(service.accept).not.toHaveBeenCalled();
  });
  it('keeps a successful query separate from a failed delivery', async () => {
    const response = await app.inject('/api/fixture/failed-delivery');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      code: 'OK',
      data: { deliveries: [{ status: 'failed', error: { code: 'DELIVERY_FAILED' } }] },
    });
  });
  it('rejects the removed event field rather than silently accepting it', async () => {
    const response = await app.inject({
      method: 'POST',
      url,
      payload: { ...body, event: 'retired' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([expect.objectContaining({ field: 'event' })]),
    });
    expect(service.accept).not.toHaveBeenCalled();
  });
  it('rejects UUIDs, mixed target ID formats and malformed IDs before accepting a notification', async () => {
    for (const ids of [
      ['00000000-0000-4000-8000-000000000001'],
      ['ch_a7c92e4f6b18', '00000000-0000-4000-8000-000000000001'],
      ['ch_short'],
      ['ch_A7C92E4F6B18'],
      [42],
      ['<TARGET_ID>'],
    ]) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: { ...body, target: { type: 'targets', ids } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(service.accept).not.toHaveBeenCalled();
  });
  it('preserves business HTTP errors and hides unexpected exception details', async () => {
    const conflict = await app.inject('/api/fixture/conflict');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', data: null });
    const failure = await app.inject('/api/fixture/exception');
    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toMatchObject({ code: 'INTERNAL_ERROR', data: null });
    expect(failure.body).not.toContain('secret-database-password');
  });
  it('normalizes malformed JSON, body limits and missing routes', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url,
      payload: '{"password":"secret",',
      headers: { 'content-type': 'application/json' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ code: 'INVALID_ARGUMENT', data: null });
    expect(malformed.body).not.toContain('secret');
    const oversized = await app.inject({
      method: 'POST',
      url,
      payload: { ...body, message: { text: 'x'.repeat(3000) } },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({ code: 'REQUEST_TOO_LARGE', data: null });
    for (const method of ['GET', 'POST'] as const) {
      const missing = await app.inject({ method, url: '/api/missing' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: 'ROUTE_NOT_FOUND', data: null });
    }
  });
  it('maps database errors to stable codes without exposing query information', () => {
    expect(errorResponse({ code: 'P2002', meta: { secret: 'never publish' } }, 'r1')).toMatchObject(
      { status: 409, body: { code: 'RESOURCE_CONFLICT', request_id: 'r1', data: null } },
    );
    expect(errorResponse({ code: 'P1001' }, 'r2').status).toBe(503);
  });
});
