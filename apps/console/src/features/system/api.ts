import { client, unwrap } from '../../shared/api';
export type SystemInfo = {
  version: string;
  deployment: string;
  database: string;
  queue: string;
  authHeader: string;
  testMode: boolean;
  redisReady: boolean;
  workerReady: boolean;
  workerLastSeen: string | null;
};
export const getSystem = async () => unwrap<SystemInfo>(await client.GET('/api/admin/system'));
export const changePassword = async (body: { oldPassword: string; newPassword: string }) =>
  unwrap(await client.POST('/api/admin/password', { body }));
export const getAudit = async () =>
  unwrap<
    {
      id: string;
      actor: string;
      action: string;
      resource: string;
      details: Record<string, unknown>;
      createdAt: string;
    }[]
  >(await client.GET('/api/admin/audit'));

export type ApiSettings = { authEnabled: boolean; perMinuteLimit: number };
export const getApiSettings = async () =>
  unwrap<ApiSettings>(await client.GET('/api/admin/api-settings'));
export const saveApiSettings = async (body: ApiSettings) =>
  unwrap<ApiSettings>(await client.PUT('/api/admin/api-settings', { body }));
