import { Delivery, client, unwrap } from '../../shared/api';
export type DeliveryDetail = Delivery & {
  text: string;
  notificationId: string;
  attempts: {
    id: string;
    number: number;
    status: string;
    code: string;
    message: string;
    startedAt: string;
    finishedAt: string;
  }[];
};
export const getDeliveries = async (status?: string, cursor?: string) =>
  unwrap<{ items: Delivery[]; nextCursor: string | null }>(
    await client.GET('/api/admin/deliveries', {
      params: { query: { status: status || undefined, cursor } },
    }),
  );
export const getDelivery = async (id: string) =>
  unwrap<DeliveryDetail>(
    await client.GET('/api/admin/deliveries/{id}', { params: { path: { id } } }),
  );
export const cancelDelivery = async (id: string) =>
  unwrap(await client.POST('/api/admin/deliveries/{id}/cancel', { params: { path: { id } } }));
export const replayDelivery = async (id: string, reason: string, confirmed: boolean) =>
  unwrap(
    await client.POST('/api/admin/deliveries/{id}/replays', {
      params: { path: { id } },
      body: { reason, confirmed },
    }),
  );
export const resolveDelivery = async (id: string, reason: string) =>
  unwrap(
    await client.POST('/api/admin/deliveries/{id}/resolve', {
      params: { path: { id } },
      body: { reason, confirmed: true },
    }),
  );
export const testSend = async (body: {
  applicationId: string;
  targetIds: string[];
  text: string;
}) =>
  unwrap<{ notification_id: string }>(await client.POST('/api/admin/notifications/test', { body }));
