import { OpenAPIObject } from '@nestjs/swagger';

// Explicitly publish the application API. Admin/session endpoints stay out of developer docs.
const publicPaths = new Set([
  '/api/v1/apps/{appKey}/notifications',
  '/api/v1/apps/{appKey}/notifications/{id}',
  '/api/v1/apps/{appKey}/notifications/{id}/deliveries',
  '/api/v1/apps/{appKey}/deliveries/{id}',
]);

export function publicOpenApi(document: OpenAPIObject): OpenAPIObject {
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => publicPaths.has(path)),
  );
  const schemas: NonNullable<OpenAPIObject['components']>['schemas'] = {};
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const ref = (value as { $ref?: string }).$ref;
    if (ref?.startsWith('#/components/schemas/')) {
      const name = ref.slice('#/components/schemas/'.length);
      const schema = document.components?.schemas?.[name];
      if (schema && !schemas[name]) {
        schemas[name] = schema;
        visit(schema);
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(paths);
  return {
    openapi: document.openapi,
    info: {
      ...document.info,
      title: 'MsgDock 通知 API',
      description:
        '从业务服务端发送与查询通知。默认通过 `Authorization: Bearer <API_KEY>` 鉴权。' +
        '只有管理员显式关闭应用发送鉴权时，POST 通知可省略凭证；所有查询始终需要 API Key。' +
        '\n\n所有响应包含 code、message、data、request_id。HTTP 202 与 code=OK 代表持久化受理，不代表消息已送达。查询成功时 code=OK，投递状态与原因在 data.deliveries 的 status/error 中。接口失败时保留对应 HTTP 状态码，data 为 null，按稳定的 code 判断原因。' +
        '\n\n每次新的业务通知需要在 JSON 中填写唯一的 `idempotency_key`；重试同一请求时复用原值。相同键对应不同内容返回 HTTP 409 / IDEMPOTENCY_CONFLICT。',
    },
    servers: [{ url: '/', description: '当前部署实例' }],
    paths,
    tags: [{ name: '通知 API', description: '通知受理与目标级投递结果' }],
    components: {
      schemas,
      securitySchemes: { bearer: document.components!.securitySchemes!.bearer! },
    },
  };
}
