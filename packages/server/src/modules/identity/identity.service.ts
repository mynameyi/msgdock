import { ServiceError } from '../../errors';
import { Injectable, Module } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import {
  DatabaseService,
  RedisService,
  SecretService,
  randomSecret,
  secretEqual,
  sha256,
} from '../../infrastructure';

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly secrets: SecretService,
    private readonly redis: RedisService,
  ) {}
  async status() {
    return { needsSetup: (await this.db.user.count()) === 0, version: '0.1.0' };
  }
  async setup(username: string, password: string, token: string) {
    if (!secretEqual(this.secrets.setupToken(), token))
      throw new ServiceError('SETUP_TOKEN_INVALID');
    const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7042301)`;
      if (await tx.user.count()) throw new ServiceError('ALREADY_INITIALIZED');
      await tx.user.create({ data: { username, passwordHash } });
      await tx.audit.create({
        data: { actor: username, action: 'identity.setup', resource: 'workspace', details: {} },
      });
    });
    return this.login(username, password, 'setup');
  }
  async login(username: string, password: string, ip: string) {
    if (!(await this.redis.limit(`login:${sha256(ip)}`, 10, 300000)))
      throw new ServiceError('RATE_LIMITED', '尝试次数过多，请稍后再试');
    const user = await this.db.user.findUnique({ where: { username } });
    const dummy =
      '$argon2id$v=19$m=19456,t=2,p=1$hTLSSJ8EJSjZJmEmuFkKJQ$Ajqzay7NSIpzrxZzWP26Aeza3S3vCTog2orazV/cvE0';
    const valid = await verify(user?.passwordHash ?? dummy, password).catch(() => false);
    if (!user || !valid) throw new ServiceError('LOGIN_FAILED');
    const token = randomSecret(),
      csrfToken = randomSecret();
    await this.db.session.create({
      data: {
        id: sha256(token),
        userId: user.id,
        csrfToken,
        expiresAt: new Date(Date.now() + 12 * 3600000),
      },
    });
    return { token, csrfToken, user: { id: user.id, username: user.username, role: 'owner' } };
  }
  async session(token?: string) {
    if (!token) return null;
    const session = await this.db.session.findUnique({
      where: { id: sha256(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    return {
      csrfToken: session.csrfToken,
      user: { id: session.user.id, username: session.user.username, role: 'owner' },
    };
  }
  async logout(token: string) {
    await this.db.session.deleteMany({ where: { id: sha256(token) } });
  }
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    currentToken: string,
  ) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !(await verify(user.passwordHash, oldPassword).catch(() => false)))
      throw new ServiceError('PASSWORD_INVALID');
    const passwordHash = await hash(newPassword, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId, id: { not: sha256(currentToken) } } });
      await tx.audit.create({
        data: {
          actor: user.username,
          action: 'identity.password_change',
          resource: userId,
          details: {},
        },
      });
    });
    return { ok: true };
  }
}
@Module({ providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
