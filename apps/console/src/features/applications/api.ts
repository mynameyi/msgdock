import { AppRecord, client, unwrap, components } from '../../shared/api';
export const getApplications = async () =>
  unwrap<AppRecord[]>(await client.GET('/api/admin/applications'));
export const saveApplication = async (
  body: components['schemas']['ApplicationDto'],
  id?: string,
) =>
  id
    ? unwrap(await client.PUT('/api/admin/applications/{id}', { params: { path: { id } }, body }))
    : unwrap(await client.POST('/api/admin/applications', { body }));
export const createKey = async (id: string) =>
  unwrap<{ id: string; key: string }>(
    await client.POST('/api/admin/applications/{id}/keys', { params: { path: { id } } }),
  );
export const revokeKey = async (id: string, keyId: string) =>
  unwrap(
    await client.POST('/api/admin/applications/{id}/keys/{keyId}/revoke', {
      params: { path: { id, keyId } },
    }),
  );
