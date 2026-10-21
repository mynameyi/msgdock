import { DeliveriesService } from './deliveries.service';
import { DatabaseService } from '../../infrastructure';

describe('administrator replay authorization', () => {
  it.each([
    { enabled: false, revokedAt: null },
    { enabled: true, revokedAt: new Date() },
  ])(
    'reports unusable source keys as an operation conflict, preserving the admin session',
    async (key) => {
      const db = {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({
            delivery: {
              findUnique: async () => ({
                status: 'cancelled',
                notification: { apiKeyId: 'key-id', apiKey: key },
              }),
            },
          }),
      };
      const service = new DeliveriesService(db as unknown as DatabaseService);
      await expect(
        service.replay('delivery-id', 'admin', '核实后重发', true),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'DELIVERY_STATE_CONFLICT' },
      });
    },
  );
});
