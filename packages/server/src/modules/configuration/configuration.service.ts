import { ServiceError } from '../../errors';
import { Injectable, Module } from '@nestjs/common';
import { ConfigValues } from '@msgdock/plugin-sdk';
import { channelRegistry } from '@msgdock/channels';
import { Prisma } from '@msgdock/database';
import { SecretService, randomSecret, sha256 } from '../../infrastructure';
import { ConfigurationRepository } from './configuration.repository';

export interface ApplicationInput {
  name: string;
  key: string;
  authMode: 'api_key' | 'none';
  allowedTargetIds: string[];
  enabled: boolean;
  perMinuteLimit: number;
}
export interface ChannelInput {
  name: string;
  type: string;
  pluginVersion?: string;
  credentials: ConfigValues;
  targetConfig?: ConfigValues;
  enabled: boolean;
  openConversationId?: string;
}
@Injectable()
export class ConfigurationService {
  constructor(
    readonly repository: ConfigurationRepository,
    private readonly secrets: SecretService,
  ) {}
  private get db() {
    return this.repository.db;
  }
  async applications() {
    return this.db.application.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        keys: { where: { revokedAt: null }, select: { id: true, prefix: true, createdAt: true } },
      },
    });
  }
  async saveApplication(input: ApplicationInput, actor: string, id?: string) {
    if (!(await this.repository.targetsExist(input.allowedTargetIds)))
      throw new ServiceError('TARGET_UNAVAILABLE', '目标不存在');
    const record = await this.db.$transaction(async (tx) => {
      const app = id
        ? await tx.application.update({ where: { id }, data: input })
        : await tx.application.create({ data: input });
      await tx.audit.create({
        data: {
          actor,
          action: 'application.save',
          resource: app.id,
          details: { authMode: input.authMode, enabled: input.enabled },
        },
      });
      return app;
    });
    return record;
  }
  async createKey(id: string, actor: string) {
    const app = await this.db.application.findUnique({ where: { id } });
    if (!app) throw new ServiceError('APPLICATION_NOT_FOUND');
    const key = `md_${randomSecret()}`;
    const record = await this.db.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: { applicationId: id, hash: sha256(key), prefix: key.slice(0, 11) },
      });
      await tx.audit.create({
        data: { actor, action: 'api_key.create', resource: id, details: { keyId: created.id } },
      });
      return created;
    });
    return { id: record.id, key };
  }
  async revokeKey(id: string, keyId: string, actor: string) {
    await this.db.$transaction(async (tx) => {
      await tx.apiKey.updateMany({
        where: { id: keyId, applicationId: id },
        data: { revokedAt: new Date() },
      });
      await tx.audit.create({
        data: { actor, action: 'api_key.revoke', resource: id, details: { keyId } },
      });
    });
    return { ok: true };
  }
  async channels() {
    return this.db.channel.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        shortId: true,
        name: true,
        type: true,
        pluginVersion: true,
        configVersion: true,
        enabled: true,
        lastStatus: true,
        lastCheckedAt: true,
        createdAt: true,
        targets: true,
      },
    });
  }
  plugins() {
    return channelRegistry.list();
  }
  async saveChannel(input: ChannelInput, actor: string, id?: string) {
    let credentials = input.credentials;
    let pluginVersion = input.pluginVersion;
    if (id) {
      const old = await this.db.channel.findUnique({ where: { id } });
      if (!old) throw new ServiceError('CHANNEL_NOT_FOUND');
      if (old.type !== input.type) throw new ServiceError('CHANNEL_TYPE_IMMUTABLE');
      if (pluginVersion && old.pluginVersion !== pluginVersion)
        throw new ServiceError('CHANNEL_VERSION_IMMUTABLE');
      pluginVersion = old.pluginVersion;
      credentials = {
        ...this.secrets.decrypt<ConfigValues>(old.credentials),
        ...Object.fromEntries(
          Object.entries(input.credentials).filter(([, v]) => v !== '' && v !== undefined),
        ),
      };
    }
    // Backward-compatible alias for 0.1.0 clients; no platform-specific validation here.
    const targetConfig =
      input.targetConfig ??
      (input.openConversationId ? { openConversationId: input.openConversationId } : {});
    let plugin;
    try {
      plugin = channelRegistry.get(input.type, pluginVersion);
      channelRegistry.validate(input.type, plugin.descriptor.version, credentials, targetConfig);
    } catch (error) {
      throw new ServiceError('CHANNEL_CONFIG_INVALID', (error as Error).message);
    }
    const save = () =>
      this.db.$transaction(async (tx) => {
        const data = {
          name: input.name,
          type: input.type,
          pluginVersion: plugin.descriptor.version,
          configVersion: plugin.descriptor.configVersion,
          enabled: input.enabled,
          credentials: this.secrets.encrypt(credentials),
        };
        const channel = id
          ? await tx.channel.update({ where: { id }, data })
          : await tx.channel.create({ data });
        const target = await tx.target.findFirst({ where: { channelId: channel.id } });
        const targetData = {
          name: input.name,
          config: targetConfig as Prisma.InputJsonValue,
        };
        if (target) await tx.target.update({ where: { id: target.id }, data: targetData });
        else await tx.target.create({ data: { ...targetData, channelId: channel.id } });
        await tx.audit.create({
          data: {
            actor,
            action: 'channel.save',
            resource: channel.id,
            details: {
              type: input.type,
              pluginVersion: plugin.descriptor.version,
              enabled: input.enabled,
            },
          },
        });
        return { id: channel.id, shortId: channel.shortId };
      });
    for (let attempt = 0; ; attempt++) {
      try {
        return await save();
      } catch (error) {
        const conflict = error as { code?: string; meta?: { target?: string[] } };
        // Retry the whole transaction, so a collision cannot leave a target or audit record.
        if (
          id ||
          attempt >= 4 ||
          conflict.code !== 'P2002' ||
          !conflict.meta?.target?.includes('shortId')
        )
          throw error;
      }
    }
  }
  async targets() {
    return this.db.target.findMany({
      include: { channel: { select: { name: true, shortId: true, type: true, enabled: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  async topics() {
    return this.db.topic.findMany({ orderBy: { createdAt: 'desc' } });
  }
  async saveTopic(
    input: { name: string; key: string; targetIds: string[] },
    actor: string,
    id?: string,
  ) {
    if (!(await this.repository.targetsExist(input.targetIds)))
      throw new ServiceError('TARGET_UNAVAILABLE', '目标不存在');
    const topic = id
      ? await this.db.topic.update({ where: { id }, data: input })
      : await this.db.topic.create({ data: input });
    await this.repository.audit(actor, 'topic.save', topic.id);
    return topic;
  }
  async templates() {
    return this.db.template.findMany({
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async saveTemplate(
    input: { name: string; key: string; body: string },
    actor: string,
    id?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      if (id) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const template = id
        ? await tx.template.update({ where: { id }, data: { name: input.name, key: input.key } })
        : await tx.template.create({ data: { name: input.name, key: input.key } });
      const latest = await tx.templateVersion.findFirst({
        where: { templateId: template.id },
        orderBy: { version: 'desc' },
      });
      await tx.templateVersion.create({
        data: { templateId: template.id, version: (latest?.version ?? 0) + 1, body: input.body },
      });
      await tx.audit.create({
        data: {
          actor,
          action: 'template.version',
          resource: template.id,
          details: { version: (latest?.version ?? 0) + 1 },
        },
      });
      return template;
    });
  }
  async audit() {
    return this.db.audit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
  json(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
@Module({
  providers: [ConfigurationRepository, ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
