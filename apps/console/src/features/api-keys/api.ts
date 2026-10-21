import { ApiKeyRecord, client, unwrap, components } from '../../shared/api';
export const getApiKeys = async () =>
  unwrap<ApiKeyRecord[]>(await client.GET('/api/admin/api-keys'));
export const createKey = async (body: components['schemas']['ApiKeyDto']) =>
  unwrap<ApiKeyRecord & { key: string }>(await client.POST('/api/admin/api-keys', { body }));
export const updateKey = async (id: string, body: components['schemas']['ApiKeyDto']) =>
  unwrap<Omit<ApiKeyRecord, 'key'>>(
    await client.PUT('/api/admin/api-keys/{id}', { params: { path: { id } }, body }),
  );
export const revokeKey = async (id: string) =>
  unwrap(await client.POST('/api/admin/api-keys/{id}/revoke', { params: { path: { id } } }));
