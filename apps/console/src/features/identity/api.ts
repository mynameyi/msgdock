import { client, unwrap } from '../../shared/api';
export type Session = { csrfToken: string; user: { id: string; username: string; role: string } };
export const getBootstrap = async () =>
  unwrap<{ needsSetup: boolean; version: string }>(await client.GET('/api/admin/bootstrap'));
export const getSession = async () => unwrap<Session>(await client.GET('/api/admin/session'));
export const login = async (body: { username: string; password: string }) =>
  unwrap<Session>(await client.POST('/api/admin/login', { body }));
export const setup = async (body: { username: string; password: string; setupToken: string }) =>
  unwrap<Session>(await client.POST('/api/admin/setup', { body }));
export const logout = async () => unwrap(await client.POST('/api/admin/logout'));
