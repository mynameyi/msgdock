import 'reflect-metadata';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseService, DeliveriesService, RedisService } from '@msgdock/server';
import { AppModule } from './app.module';
import { publicOpenApi } from './public-openapi';

@Catch()
class SafeErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<FastifyRequest>(),
      reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = 500,
      message: unknown = '服务暂时不可用';
    const code = (exception as { code?: string }).code;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      message =
        typeof response === 'string' ? response : (response as { message: unknown }).message;
    } else if (code && ['P1001', 'P1002', 'P1017', 'P2024'].includes(code)) {
      status = 503;
      message = '数据服务暂时不可用，请稍后重试';
    } else if (code === 'P2002') {
      status = 409;
      message = '标识已存在，请换一个名称或 Key';
    } else if (code === 'P2025') {
      status = 404;
      message = '资源不存在';
    } else if (code === 'P2023') {
      status = 400;
      message = '资源标识格式无效';
    }
    reply.code(status).send({ code: `HTTP_${status}`, message, request_id: req.id });
  }
}
async function main() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 65536,
      requestTimeout: 15000,
      trustProxy: false,
      logger: {
        level: 'warn',
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]'],
      },
    }),
    { logger: ['error', 'warn', 'log'] },
  );
  await app.register(cookie);
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new SafeErrors());
  app.enableShutdownHooks();
  const server = app.getHttpAdapter().getInstance();
  server.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (req.url.startsWith('/api')) reply.header('Cache-Control', 'no-store');
    reply.header(
      'Content-Security-Policy',
      // ReDoc's local search uses a bundled Blob worker. Script and network sources remain local.
      "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MsgDock API')
      .setVersion('0.2.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        description: '不透明 API Key，通过 Authorization: Bearer 传递',
      })
      .addCookieAuth('md_session')
      .addSecurity('anonymous', {
        type: 'http',
        scheme: 'bearer',
        description: '仅为发送接口的匿名配置说明；实际以应用 authMode 为准',
      })
      .build(),
  );
  // Empty security requirement expresses conditional anonymous access without inventing a second credential.
  const path = document.paths['/api/v1/apps/{appKey}/notifications'];
  if (path?.post) path.post.security = [{ bearer: [] }, {}];
  if (process.env.OPENAPI_OUTPUT) {
    const filename = resolve(process.env.OPENAPI_OUTPUT);
    mkdirSync(resolve(filename, '..'), { recursive: true });
    writeFileSync(filename, JSON.stringify(document, null, 2) + '\n');
  }
  if (process.env.GENERATE_OPENAPI_ONLY === 'true') {
    await app.close();
    return;
  }
  const publicDocument = publicOpenApi(document);
  server.get('/openapi.json', async () => publicDocument);
  server.get('/health/live', async () => ({ ok: true }));
  server.get('/health/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await app.get(DeliveriesService).health();
      const redis = await app.get(RedisService).client.ping();
      if (!health.workerReady || redis !== 'PONG') return reply.code(503).send({ ok: false });
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  const publicPath = resolve(process.env.CONSOLE_DIR ?? 'apps/console/dist');
  if (existsSync(publicPath)) {
    await app.register(staticFiles, { root: publicPath, wildcard: false, index: false });
    server.get('/*', async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/health/') || req.url.includes('.'))
        return reply.code(404).send({ message: 'Not Found' });
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    });
  }
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
  app.get(DatabaseService);
}
void main().catch(() => {
  console.error('API 启动失败，请检查配置、迁移和数据服务');
  process.exit(1);
});
