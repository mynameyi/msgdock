import { NotificationsService } from './notifications.service';
import { DatabaseService, RedisService, sha256 } from '../../infrastructure';

describe('instance API key authentication', () => {
  const token = 'md_' + 'a'.repeat(43);
  const key = { id: 'key-id', enabled: true, revokedAt: null };
  const db = { apiKey: { findUnique: jest.fn() }, apiSettings: { findUnique: jest.fn() } };
  const service = new NotificationsService(db as unknown as DatabaseService, {} as RedisService);
  beforeEach(() => {
    jest.clearAllMocks();
    db.apiKey.findUnique.mockResolvedValue(key);
    db.apiSettings.findUnique.mockResolvedValue({ authEnabled: true, perMinuteLimit: 60 });
  });
  it('requires a key by default, including when no settings row exists', async () => {
    await expect(service.authenticate()).rejects.toMatchObject({
      response: { code: 'API_KEY_REQUIRED' },
    });
    db.apiSettings.findUnique.mockResolvedValue(null);
    await expect(service.authenticate()).rejects.toMatchObject({
      response: { code: 'API_KEY_REQUIRED' },
    });
  });
  it('uses only the Bearer key hash and does not require a client identifier', async () => {
    await expect(service.authenticate('Bearer ' + token)).resolves.toEqual({ apiKeyId: key.id });
    expect(db.apiKey.findUnique).toHaveBeenCalledWith({ where: { hash: sha256(token) } });
  });
  it('allows omission only after the instance authentication switch is off', async () => {
    db.apiSettings.findUnique.mockResolvedValue({ authEnabled: false, perMinuteLimit: 60 });
    await expect(service.authenticate()).resolves.toEqual({ apiKeyId: null });
  });
  it('rejects supplied invalid credentials even while anonymous access is enabled', async () => {
    db.apiSettings.findUnique.mockResolvedValue({ authEnabled: false, perMinuteLimit: 60 });
    for (const header of ['', 'invalid', 'Bearer invalid', 'Basic fixture'])
      await expect(service.authenticate(header)).rejects.toMatchObject({
        response: { code: 'API_KEY_INVALID' },
      });
    db.apiKey.findUnique.mockResolvedValue(null);
    await expect(service.authenticate('Bearer ' + token)).rejects.toMatchObject({
      response: { code: 'API_KEY_INVALID' },
    });
  });
  it('rejects disabled or revoked keys', async () => {
    for (const record of [
      { ...key, enabled: false },
      { ...key, revokedAt: new Date() },
    ]) {
      db.apiKey.findUnique.mockResolvedValue(record);
      await expect(service.authenticate('Bearer ' + token)).rejects.toMatchObject({
        response: { code: 'API_KEY_INVALID' },
      });
    }
  });
});
