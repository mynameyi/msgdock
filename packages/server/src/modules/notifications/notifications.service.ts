import { ServiceError } from '../../errors';
import { Injectable, Module } from '@nestjs/common';
import { Prisma } from '@msgdock/database';
import { channelRegistry } from '@msgdock/channels';
import { channelIdPattern } from '@msgdock/contracts';
import { randomUUID } from 'node:crypto';
import { DatabaseService, RedisService, sha256 } from '../../infrastructure';
import { renderText, requestHash } from './render';
import { deliveryView } from '../deliveries/view';
import { readApiSettings } from './api-access';

export interface NotificationInput {
  target: { type: 'targets' | 'topic'; ids?: string[]; key?: string };
  message?: { text: string };
  template?: { key: string };
  variables?: Record<string, unknown>;
  expires_in?: number;
}
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}
  async authenticate(authorization?: string) {
    if (authorization !== undefined) {
      const match = /^Bearer (md_[A-Za-z0-9_-]{43})$/i.exec(authorization);
      const key = match
        ? await this.db.apiKey.findUnique({ where: { hash: sha256(match[1]!) } })
        : null;
      if (!key || !key.enabled || key.revokedAt) throw new ServiceError('API_KEY_INVALID');
      return { apiKeyId: key.id };
    }
    if ((await readApiSettings(this.db)).authEnabled) throw new ServiceError('API_KEY_REQUIRED');
    return { apiKeyId: null };
  }
  async accept(
    apiKeyId: string | null,
    input: NotificationInput,
    idempotencyKey: string = randomUUID(),
    origin: 'api' | 'console' = 'api',
  ) {
    if (!/^[\x21-\x7E]{1,200}$/.test(idempotencyKey))
      throw new ServiceError('IDEMPOTENCY_KEY_INVALID');
    if (
      input.target.type === 'targets' &&
      (input.target.ids ?? []).some((id) => !channelIdPattern.test(id))
    )
      throw new ServiceError(
        'INVALID_ARGUMENT',
        'target.ids 仅接受渠道短 ID（ch_ 加 12 位小写十六进制字符）',
      );
    if (apiKeyId) {
      const key = await this.db.apiKey.findUnique({ where: { id: apiKeyId } });
      if (!key || !key.enabled || key.revokedAt) throw new ServiceError('API_KEY_INVALID');
    }
    const settings = await readApiSettings(this.db);
    if (origin === 'api' && !apiKeyId && settings.authEnabled)
      throw new ServiceError('API_KEY_REQUIRED');
    if (!(await this.redis.limit('api-send-limit', settings.perMinuteLimit)))
      throw new ServiceError('RATE_LIMITED');
    const idempotencyScope = apiKeyId ?? (origin === 'console' ? 'console' : 'anonymous');
    const hash = requestHash({
      ...input,
      expires_in: input.expires_in ?? 3600,
      variables: input.variables ?? {},
    });
    const existing = await this.db.notification.findUnique({
      where: { idempotencyScope_idempotencyKey: { idempotencyScope, idempotencyKey } },
      include: { _count: { select: { deliveries: true } } },
    });
    if (existing) {
      if (existing.requestHash !== hash) throw new ServiceError('IDEMPOTENCY_CONFLICT');
      return {
        notification_id: existing.id,
        status: 'accepted_for_processing',
        delivery_count: existing._count.deliveries,
        idempotency_hit: true,
      };
    }
    if (Boolean(input.message) === Boolean(input.template))
      throw new ServiceError('MESSAGE_SOURCE_INVALID');
    let ids: string[];
    if (input.target.type === 'topic') {
      const topic = await this.db.topic.findUnique({ where: { key: input.target.key ?? '' } });
      if (!topic) throw new ServiceError('TOPIC_NOT_FOUND');
      ids = topic.targetIds;
    } else {
      const refs = [...new Set(input.target.ids ?? [])];
      if (!refs.length || refs.length > 500) throw new ServiceError('TARGETS_INVALID');
      const resolvedTargets = await this.db.target.findMany({
        where: { channel: { shortId: { in: refs } } },
        select: { id: true, channel: { select: { shortId: true } } },
      });
      ids = refs.map((ref) => {
        const matches = resolvedTargets.filter((target) => target.channel.shortId === ref);
        // Never select a default recipient when a channel has ambiguous targets.
        if (matches.length !== 1) throw new ServiceError('TARGET_UNAVAILABLE');
        return matches[0]!.id;
      });
    }
    ids = [...new Set(ids)];
    if (!ids.length || ids.length > 500) throw new ServiceError('TARGETS_INVALID');
    const targets = await this.db.target.findMany({
      where: { id: { in: ids } },
      include: { channel: true },
    });
    if (targets.length !== ids.length || targets.some((t) => !t.channel.enabled))
      throw new ServiceError('TARGET_UNAVAILABLE');
    let text = input.message?.text ?? '';
    let versionId: string | undefined;
    if (input.template) {
      const template = await this.db.template.findUnique({
        where: { key: input.template.key },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = template?.versions[0];
      if (!version) throw new ServiceError('TEMPLATE_NOT_FOUND');
      text = renderText(version.body, input.variables ?? {});
      versionId = version.id;
    }
    if (!text.trim() || Buffer.byteLength(text, 'utf8') > 2000)
      throw new ServiceError('MESSAGE_INVALID');
    for (const target of targets) {
      try {
        const descriptor = channelRegistry.get(
          target.channel.type,
          target.channel.pluginVersion,
        ).descriptor;
        if (
          descriptor.configVersion !== target.channel.configVersion ||
          Buffer.byteLength(text, 'utf8') > descriptor.capabilities.maxTextBytes
        )
          throw new Error('插件配置版本或消息能力不兼容');
      } catch {
        throw new ServiceError('CHANNEL_PLUGIN_UNAVAILABLE');
      }
    }
    const queued = await this.db.delivery.count({
      where: { status: { in: ['pending', 'retry_wait', 'sending'] } },
    });
    if (queued + ids.length > 100000) throw new ServiceError('QUEUE_CAPACITY_EXCEEDED');
    const expiresAt = new Date(Date.now() + (input.expires_in ?? 3600) * 1000);
    try {
      return await this.db.$transaction(async (tx) => {
        const notice = await tx.notification.create({
          data: {
            apiKeyId,
            idempotencyScope,
            idempotencyKey,
            requestHash: hash,
            expiresAt,
            snapshot: {
              text,
              templateVersionId: versionId ?? null,
              variables: input.variables ?? {},
            } as Prisma.InputJsonValue,
          },
        });
        const deliveries = targets.map((target) => ({
          id: randomUUID(),
          notificationId: notice.id,
          channelId: target.channelId,
          targetId: target.id,
          targetName: target.name,
          targetSnapshot: target.config as Prisma.InputJsonValue,
          pluginId: target.channel.type,
          pluginVersion: target.channel.pluginVersion,
          configVersion: target.channel.configVersion,
          text,
          expiresAt,
        }));
        await tx.delivery.createMany({ data: deliveries });
        await tx.outbox.createMany({
          data: deliveries.map((d) => ({ deliveryId: d.id, generation: 0 })),
        });
        return {
          notification_id: notice.id,
          status: 'accepted_for_processing',
          delivery_count: deliveries.length,
          idempotency_hit: false,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const notice = await this.db.notification.findUnique({
          where: { idempotencyScope_idempotencyKey: { idempotencyScope, idempotencyKey } },
          include: { _count: { select: { deliveries: true } } },
        });
        if (notice?.requestHash === hash)
          return {
            notification_id: notice.id,
            status: 'accepted_for_processing',
            delivery_count: notice._count.deliveries,
            idempotency_hit: true,
          };
        throw new ServiceError('IDEMPOTENCY_CONFLICT');
      }
      throw error;
    }
  }
  async query(id: string) {
    const notification = await this.db.notification.findFirst({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        deliveries: {
          select: {
            id: true,
            status: true,
            targetName: true,
            attemptCount: true,
            lastCode: true,
            lastMessage: true,
          },
        },
      },
    });
    if (!notification) throw new ServiceError('NOTIFICATION_NOT_FOUND');
    return { ...notification, deliveries: notification.deliveries.map(deliveryView) };
  }
  async queryDeliveries(id: string, cursor?: string) {
    await this.query(id);
    const items = await this.db.delivery.findMany({
      where: { notificationId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        targetName: true,
        attemptCount: true,
        lastCode: true,
        lastMessage: true,
        createdAt: true,
      },
    });
    return {
      items: items.slice(0, 50).map(deliveryView),
      nextCursor: items.length > 50 ? items[49]!.id : null,
    };
  }
  async queryDelivery(id: string) {
    const delivery = await this.db.delivery.findFirst({
      where: { id },
      select: {
        id: true,
        notificationId: true,
        status: true,
        targetName: true,
        attemptCount: true,
        lastCode: true,
        lastMessage: true,
        createdAt: true,
      },
    });
    if (!delivery) throw new ServiceError('DELIVERY_NOT_FOUND');
    return deliveryView(delivery);
  }
  async adminTest(targetIds: string[], text: string, actor: string) {
    const result = await this.accept(
      null,
      { target: { type: 'targets', ids: targetIds }, message: { text } },
      `test-${randomUUID()}`,
      'console',
    );
    await this.db.audit.create({
      data: { actor, action: 'notification.test', resource: result.notification_id, details: {} },
    });
    return result;
  }
}
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
