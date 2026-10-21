import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { OpenAPIObject } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from 'class-validator';
import { map } from 'rxjs';
import { errorCatalog, ErrorCode, ServiceError, ValidationIssue } from '@msgdock/server';

const statusCodes: Record<number, ErrorCode> = {
  400: 'INVALID_ARGUMENT',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'ROUTE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'RESOURCE_CONFLICT',
  413: 'REQUEST_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
  502: 'BAD_GATEWAY',
  504: 'GATEWAY_TIMEOUT',
};

export function errorResponse(exception: unknown, requestId: string) {
  let code: ErrorCode = 'INTERNAL_ERROR';
  let message: string | undefined;
  let details: ValidationIssue[] | undefined;
  let status: number | undefined;
  if (exception instanceof ServiceError) {
    const response = exception.getResponse() as {
      code: ErrorCode;
      message: string;
      details?: ValidationIssue[];
    };
    ({ code, message, details } = response);
  } else if (exception instanceof HttpException) {
    status = exception.getStatus();
    code = statusCodes[status] ?? (status < 500 ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR');
    const body = exception.getResponse();
    // Keep framework validation feedback; never expose exception/SQL details for server errors.
    if (
      exception.getStatus() < 500 &&
      body &&
      typeof body !== 'string' &&
      Array.isArray((body as { message?: unknown }).message)
    ) {
      code = 'VALIDATION_ERROR';
      details = (body as { message: string[] }).message.map((value) => ({
        field: '',
        message: value,
      }));
    }
  } else if (exception && typeof exception === 'object') {
    const error = exception as { code?: string; statusCode?: number };
    if (['P1001', 'P1002', 'P1017', 'P2024'].includes(error.code ?? ''))
      code = 'DATABASE_UNAVAILABLE';
    else if (error.code === 'P2002') code = 'RESOURCE_CONFLICT';
    else if (error.code === 'P2025') code = 'RESOURCE_NOT_FOUND';
    else if (error.code === 'P2023') code = 'RESOURCE_ID_INVALID';
    else if (error.statusCode && error.statusCode >= 400 && error.statusCode < 600) {
      status = error.statusCode;
      code = statusCodes[status] ?? (status < 500 ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR');
    }
  }
  return {
    status: status ?? errorCatalog[code][0],
    body: {
      code,
      message: message ?? errorCatalog[code][1],
      data: null,
      request_id: requestId,
      ...(details ? { details } : {}),
    },
  };
}

export function validationIssues(errors: ValidationError[], prefix = ''): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({ field, message })),
      ...validationIssues(error.children ?? [], field),
    ];
  });
}

@Injectable()
export class ResponseEnvelope implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    return next.handle().pipe(
      map((data: unknown) => ({
        code: 'OK',
        message: reply.statusCode === 202 ? '通知已受理' : '请求成功',
        data: data ?? null,
        request_id: req.id,
      })),
    );
  }
}
@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const response = errorResponse(exception, req.id);
    reply.code(response.status).send(response.body);
  }
}

export function configureResponseContract(app: NestFastifyApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new ServiceError('VALIDATION_ERROR', undefined, validationIssues(errors)),
    }),
  );
  app.useGlobalFilters(new SafeErrors());
  app.useGlobalInterceptors(new ResponseEnvelope());
  // Also normalize Fastify parser/body-limit errors and routes outside Nest's controllers.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      if (!req.url.startsWith('/api/')) return payload;
      reply.header('X-Request-Id', req.id);
      if (reply.statusCode >= 400 && typeof payload === 'string') {
        let parsed: Record<string, unknown> = {};
        try {
          const value: unknown = JSON.parse(payload);
          if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
        } catch {
          /* Framework errors can be plain text. */
        }
        if (!(
          typeof parsed.code === 'string' &&
          Object.hasOwn(errorCatalog, parsed.code) &&
          parsed.request_id === req.id &&
          parsed.data === null
        )) {
          const error = errorResponse({ statusCode: reply.statusCode }, req.id);
          reply.type('application/json');
          return JSON.stringify(error.body);
        }
      }
      return payload;
    });
}

export function describeResponseContract(document: OpenAPIObject) {
  for (const path of Object.values(document.paths)) {
    if (!path) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
      const operation = path[method];
      if (!operation) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response || '$ref' in response) continue;
        if (Number(status) >= 200 && Number(status) < 300) {
          const schema = response.content?.['application/json']?.schema ?? {};
          response.content = {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'message', 'data', 'request_id'],
                properties: {
                  code: { type: 'string', enum: ['OK'] },
                  message: { type: 'string' },
                  data: schema,
                  request_id: { type: 'string' },
                },
              },
            },
          };
        } else if (Number(status) >= 400) {
          response.content = {
            'application/json': { schema: { $ref: '#/components/schemas/ApiErrorDto' } },
          };
        }
      }
      operation.responses.default = {
        description: '接口错误；HTTP 状态码保留原有语义，data 为 null，按 code 分支处理。',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorDto' } } },
      };
    }
  }
  return document;
}
