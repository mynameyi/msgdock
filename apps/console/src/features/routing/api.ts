import { Topic, client, unwrap, components } from '../../shared/api';
export const getTopics = async () => unwrap<Topic[]>(await client.GET('/api/admin/topics'));
export const saveTopic = async (body: components['schemas']['TopicDto'], id?: string) =>
  id
    ? unwrap(await client.PUT('/api/admin/topics/{id}', { params: { path: { id } }, body }))
    : unwrap(await client.POST('/api/admin/topics', { body }));
