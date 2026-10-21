import createClient from 'openapi-fetch';
import type { paths, components } from './schema';
export type { paths, components };
let csrfToken = '';
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export const client = createClient<paths>({ baseUrl: '', credentials: 'include' });
client.use({
  onRequest({ request }) {
    if (!['GET', 'HEAD'].includes(request.method) && csrfToken)
      request.headers.set('X-CSRF-Token', csrfToken);
    return request;
  },
  onResponse({ request, response }) {
    if (
      response.status === 401 &&
      request.url.includes('/api/admin/') &&
      !/\/(session|login|setup|bootstrap)$/.test(request.url)
    )
      window.dispatchEvent(new Event('msgdock:session-expired'));
    return response;
  },
});
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'REQUEST_FAILED',
    readonly requestId?: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export function unwrap<T>(result: { data?: unknown; error?: unknown; response: Response }): T {
  const payload = (result.response.ok ? result.data : result.error) as
    | {
        code?: string;
        message?: string;
        data?: unknown;
        request_id?: string;
        details?: { field: string; message: string }[];
      }
    | undefined;
  if (!result.response.ok || (payload?.code && payload.code !== 'OK')) {
    throw new ApiError(
      payload?.details?.length
        ? payload.details.map((issue) => issue.message).join('；')
        : (payload?.message ?? '请求失败，请重试'),
      result.response.status,
      payload?.code ?? 'REQUEST_FAILED',
      payload?.request_id,
      payload?.details,
    );
  }
  if (payload?.code !== 'OK' || !Object.hasOwn(payload, 'data'))
    throw new ApiError('接口响应格式无效', result.response.status, 'INVALID_RESPONSE');
  return payload.data as T;
}
