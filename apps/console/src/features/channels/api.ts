import { Channel, Target, client, unwrap, components } from '../../shared/api';
import type { PluginDescriptor } from '@msgdock/plugin-sdk';
export const getChannelPlugins = async () =>
  unwrap<PluginDescriptor[]>(await client.GET('/api/admin/channel-plugins'));
export const getChannels = async () => unwrap<Channel[]>(await client.GET('/api/admin/channels'));
export const getTargets = async () => unwrap<Target[]>(await client.GET('/api/admin/targets'));
export const saveChannel = async (body: components['schemas']['ChannelDto'], id?: string) =>
  id
    ? unwrap(await client.PUT('/api/admin/channels/{id}', { params: { path: { id } }, body }))
    : unwrap(await client.POST('/api/admin/channels', { body }));
