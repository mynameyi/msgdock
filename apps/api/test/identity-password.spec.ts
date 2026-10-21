import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyReply, FastifyRequest } from 'fastify';
import { IdentityService, RedisService } from '@msgdock/server';
import { IdentityController } from '../src/http/identity.controller';
import { configureResponseContract } from '../src/http/response-contract';

const session = {
  token: 'password-policy-test-session',
  csrfToken: 'password-policy-test-csrf',
  user: { id: 'fixture-admin', username: 'admin', role: 'owner' },
};
const identity = {
  setup: jest.fn(async () => session),
  login: jest.fn(async () => session),
  session: jest.fn(async () => session),
  changePassword: jest.fn(async () => ({ ok: true })),
};
@Module({
  controllers: [IdentityController],
  providers: [
    { provide: IdentityService, useValue: identity },
    { provide: RedisService, useValue: { limit: jest.fn(async () => true) } },
  ],
})
class IdentityFixtureModule {}

describe('Administrator password HTTP contract', () => {
  let app: NestFastifyApplication;
  const credentials = { username: 'admin', password: '12345678' };
  const setupToken = 'setup-token-for-password-policy-tests';
  const headers = {
    cookie: `md_session=${session.token}`,
    'x-csrf-token': session.csrfToken,
  };
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      IdentityFixtureModule,
      new FastifyAdapter(),
      { logger: false },
    );
    const server = app.getHttpAdapter().getInstance();
    // Exercise the real controller and validation pipeline without testing cookie transport.
    server.decorateReply('setCookie', function (this: FastifyReply) {
      return this;
    });
    server.addHook(
      'onRequest',
      (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
        request.cookies = { md_session: session.token };
        done();
      },
    );
    configureResponseContract(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each(['setup', 'login'] as const)('accepts an eight-digit password for %s', async (action) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/${action}`,
      payload: { ...credentials, ...(action === 'setup' ? { setupToken } : {}) },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ code: 'OK', data: { user: session.user } });
    expect(identity[action]).toHaveBeenCalledWith('admin', '12345678', expect.any(String));
  });

  it('allows changing an eight-digit password to another eight-digit password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/password',
      headers,
      payload: { oldPassword: '12345678', newPassword: '24681357' },
    });
    expect(response.statusCode).toBe(201);
    expect(identity.changePassword).toHaveBeenCalledWith(
      session.user.id,
      '12345678',
      '24681357',
      session.token,
    );
  });

  it('rejects passwords outside the length bounds before accessing credentials', async () => {
    for (const invalid of ['1234567', '1'.repeat(129)]) {
      for (const action of ['login', 'setup']) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/admin/${action}`,
          payload: {
            ...credentials,
            password: invalid,
            ...(action === 'setup' ? { setupToken } : {}),
          },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      for (const field of ['oldPassword', 'newPassword']) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/password',
          headers,
          payload: { oldPassword: '12345678', newPassword: '24681357', [field]: invalid },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
    }
    expect(identity.setup).not.toHaveBeenCalled();
    expect(identity.login).not.toHaveBeenCalled();
    expect(identity.changePassword).not.toHaveBeenCalled();
  });
});
