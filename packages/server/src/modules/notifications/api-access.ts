import { DatabaseService } from '../../infrastructure';

export const apiKeyPublicSelect = {
  id: true,
  name: true,
  prefix: true,
  enabled: true,
  revokedAt: true,
  createdAt: true,
} as const;
export async function readApiSettings(db: DatabaseService) {
  return (
    (await db.apiSettings.findUnique({ where: { id: 'default' } })) ?? {
      id: 'default',
      authEnabled: true,
      perMinuteLimit: 60,
    }
  );
}
