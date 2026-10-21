import { randomBytes } from 'node:crypto';
import { ConfigurationService } from './configuration.service';
import { ConfigurationRepository } from './configuration.repository';
import { SecretService, sha256 } from '../../infrastructure';

describe('recoverable administrator API keys', () => {
  const oldMaster = process.env.MSGDOCK_MASTER_KEY;
  let secrets: SecretService;
  const metadata = {
    id: 'key-id',
    name: '测试 Key',
    prefix: 'md_fixture',
    enabled: true,
    revokedAt: null,
    createdAt: new Date(),
  };
  const apiKey = { create: jest.fn(), findMany: jest.fn() };
  const audit = { create: jest.fn() };
  const db = {
    apiKey,
    audit,
    $transaction: async (run: (tx: unknown) => unknown) => run({ apiKey, audit }),
  };
  let service: ConfigurationService;
  beforeAll(() => {
    process.env.MSGDOCK_MASTER_KEY = randomBytes(32).toString('base64');
    secrets = new SecretService();
    service = new ConfigurationService({ db } as unknown as ConfigurationRepository, secrets);
  });
  afterAll(() => {
    if (oldMaster === undefined) delete process.env.MSGDOCK_MASTER_KEY;
    else process.env.MSGDOCK_MASTER_KEY = oldMaster;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    apiKey.create.mockResolvedValue(metadata);
  });
  it('stores recoverable ciphertext alongside the authentication hash', async () => {
    const result = await service.createKey({ name: '测试 Key', enabled: true }, 'admin');
    const stored = apiKey.create.mock.calls[0]![0].data;
    expect(stored.secret).not.toContain(result.key);
    expect(secrets.decrypt<string>(stored.secret)).toBe(result.key);
    expect(stored.hash).toBe(sha256(result.key));
    expect(result).not.toHaveProperty('secret');
    expect(result).not.toHaveProperty('hash');
    expect(JSON.stringify(audit.create.mock.calls)).not.toContain(result.key);
  });
  it('returns full keys for the admin list, and null for irrecoverable legacy rows', async () => {
    const key = 'md_' + 'a'.repeat(43);
    apiKey.findMany.mockResolvedValue([
      { ...metadata, secret: secrets.encrypt(key) },
      { ...metadata, id: 'legacy', secret: null },
    ]);
    const result = await service.apiKeys();
    expect(result[0]!.key).toBe(key);
    expect(result[1]!.key).toBeNull();
    for (const row of result) {
      expect(row).not.toHaveProperty('secret');
      expect(row).not.toHaveProperty('hash');
    }
  });
});
