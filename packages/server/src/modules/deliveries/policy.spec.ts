import { deliveryResult } from './policy';
import { renderText, requestHash } from '../notifications/render';
describe('可靠投递规则', () => {
  test('不确定结果不自动重试', () => {
    expect(
      deliveryResult(
        { kind: 'unknown', code: 'timeout', message: 'uncertain' },
        1,
        new Date(Date.now() + 60000),
      ),
    ).toEqual({ status: 'unknown' });
  });
  test('达到最大次数或没有剩余有效期时终结', () => {
    const result = { kind: 'retry' as const, code: 'rate_limited', message: 'wait' };
    expect(deliveryResult(result, 6, new Date(Date.now() + 60000)).status).toBe('failed');
    expect(deliveryResult(result, 1, new Date(Date.now() + 1000)).status).toBe('expired');
  });
  test('确认接受即使响应迟到也保存确定证据', () => {
    expect(deliveryResult({ kind: 'accepted' }, 1, new Date(Date.now() - 1))).toEqual({
      status: 'accepted',
    });
  });
  test('幂等摘要不依赖 JSON 属性顺序', () => {
    expect(requestHash({ a: 1, b: { x: 2, y: 3 } })).toBe(requestHash({ b: { y: 3, x: 2 }, a: 1 }));
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
  });
  test('模板严格检查缺失变量并按纯文本输出', () => {
    expect(renderText('订单 {{order}}：{{amount}}', { order: '<1>', amount: 299 })).toBe(
      '订单 <1>：299',
    );
    expect(() => renderText('{{missing}}', {})).toThrow();
    expect(() => renderText('{{#loop}}x{{/loop}}', {})).toThrow();
    expect(() => renderText('{{constructor}}', {})).toThrow();
  });
});
