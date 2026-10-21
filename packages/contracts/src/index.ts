export type { SendOutcome, ConfigValues, PluginDescriptor } from '@msgdock/plugin-sdk';
export type DeliveryStatus =
  | 'pending'
  | 'sending'
  | 'retry_wait'
  | 'accepted'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'unknown';
export interface SendJob {
  deliveryId: string;
  generation: number;
}
