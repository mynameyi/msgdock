import { ApiError, unwrap } from './index';
describe('API client response envelope', () => {
  it('unwraps data while leaving inner delivery failures available to the caller', () => {
    const data = { deliveries: [{ status: 'failed', error: { code: 'DELIVERY_FAILED' } }] };
    expect(
      unwrap({
        data: { code: 'OK', data, request_id: 'r1' },
        response: new Response(null, { status: 200 }),
      }),
    ).toEqual(data);
  });
  it('exposes stable business codes and request IDs on API failures', () => {
    try {
      unwrap({
        error: {
          code: 'TARGET_NOT_AUTHORIZED',
          message: '目标未授权',
          data: null,
          request_id: 'r2',
        },
        response: new Response(null, { status: 403 }),
      });
      throw new Error('Expected ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: 'TARGET_NOT_AUTHORIZED', requestId: 'r2', status: 403 });
    }
  });
  it('rejects invalid response formats and handles non-JSON upstream failures', () => {
    expect(() =>
      unwrap({ data: { id: 'legacy-shape' }, response: new Response(null, { status: 200 }) }),
    ).toThrow('接口响应格式无效');
    expect(() =>
      unwrap({ error: 'Bad Gateway', response: new Response(null, { status: 502 }) }),
    ).toThrow('请求失败');
  });
});
