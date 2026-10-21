import { Channel, Delivery, client, unwrap } from '../../shared/api';
export type Overview = {
  total: number;
  previous: number;
  counts: Record<string, number>;
  pendingCount: number;
  unknownCount: number;
  channels: Channel[];
  apiKeys: number;
  recent: Delivery[];
  hours: { time: string; count: number }[];
  days: { time: string; count: number }[];
  oldestWaitingSeconds: number;
};
export const getOverview = async () => unwrap<Overview>(await client.GET('/api/admin/overview'));
