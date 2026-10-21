import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@msgdock/database';
import Redis from 'ioredis';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const secretEqual = (left: string, right: string) => {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
export const randomSecret = () => randomBytes(32).toString('base64url');
export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
  };
}

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client = new Redis({
    ...redisConnection(),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 3000,
  });
  constructor() {
    this.client.on('error', () => {});
  }
  async onModuleInit() {
    await this.client.connect();
  }
  async onModuleDestroy() {
    this.client.disconnect();
  }
  async limit(key: string, limit: number, windowMs = 60000) {
    try {
      const result = await this.client.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
        1,
        key,
        windowMs,
      );
      return Number(result) <= limit;
    } catch {
      throw new ServiceUnavailableException('队列协调服务暂时不可用，请稍后重试');
    }
  }
}
@Injectable()
export class SecretService {
  readonly master: Buffer;
  constructor() {
    const value =
      process.env.MSGDOCK_MASTER_KEY ??
      readFileSync(join(process.env.DATA_DIR ?? '/data', 'secrets/master-key'), 'utf8').trim();
    this.master = Buffer.from(value, 'base64');
    if (this.master.length !== 32) throw new Error('主密钥必须是 Base64 编码的 32 字节密钥');
  }
  encrypt(value: unknown) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.master, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }
  decrypt<T>(value: string): T {
    const [version, iv, tag, body] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('密文格式错误');
    const decipher = createDecipheriv('aes-256-gcm', this.master, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString(
        'utf8',
      ),
    ) as T;
  }
  setupToken() {
    return (
      process.env.MSGDOCK_SETUP_TOKEN ??
      readFileSync(join(process.env.DATA_DIR ?? '/data', 'secrets/setup-token'), 'utf8').trim()
    );
  }
}
@Global()
@Module({
  providers: [DatabaseService, RedisService, SecretService],
  exports: [DatabaseService, RedisService, SecretService],
})
export class InfrastructureModule {}
