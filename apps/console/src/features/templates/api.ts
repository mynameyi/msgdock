import { Template, client, unwrap, components } from '../../shared/api';
export const getTemplates = async () =>
  unwrap<Template[]>(await client.GET('/api/admin/templates'));
export const saveTemplate = async (body: components['schemas']['TemplateDto'], id?: string) =>
  id
    ? unwrap(await client.PUT('/api/admin/templates/{id}', { params: { path: { id } }, body }))
    : unwrap(await client.POST('/api/admin/templates', { body }));
