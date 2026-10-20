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
  ) {
    super(message);
  }
}
export function unwrap<T>(result: { data?: unknown; error?: unknown; response: Response }): T {
  if (!result.response.ok) {
    const error = result.error as { message?: string | string[] } | undefined;
    throw new ApiError(
      Array.isArray(error?.message)
        ? error.message.join('；')
        : (error?.message ?? '请求失败，请重试'),
      result.response.status,
    );
  }
  return result.data as T;
}
