import { deliveryView } from './view';
describe('delivery business outcome', () => {
  it('returns normalized errors while preserving plugin evidence separately', () => {
    const row = { id: 'd1', status: 'failed', lastCode: '40001', lastMessage: '平台业务拒绝' };
    expect(deliveryView(row)).toEqual({
      id: 'd1',
      status: 'failed',
      error: { code: 'DELIVERY_FAILED', message: '平台业务拒绝', source_code: '40001' },
    });
    expect(row.lastCode).toBe('40001');
  });
  it('keeps unknown outcomes explicit and does not turn successful or cancelled states into errors', () => {
    expect(
      deliveryView({ status: 'unknown', lastCode: 'network_uncertain', lastMessage: '待核实' })
        .error?.code,
    ).toBe('DELIVERY_RESULT_UNKNOWN');
    for (const status of ['pending', 'sending', 'accepted', 'cancelled'])
      expect(
        deliveryView({ status, lastCode: 'manually_verified', lastMessage: '已核实' }).error,
      ).toBeNull();
    expect(
      deliveryView({ status: 'failed', lastCode: 'plugin_unavailable', lastMessage: '版本缺失' })
        .error?.code,
    ).toBe('CHANNEL_PLUGIN_UNAVAILABLE');
  });
});
