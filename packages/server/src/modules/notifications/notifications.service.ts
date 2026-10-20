import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Module,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@msgdock/database';
import { randomUUID } from 'node:crypto';
import { DatabaseService, RedisService, sha256 } from '../../infrastructure';
import { renderText, requestHash } from './render';

export interface NotificationInput {
  event: string;
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
  async authenticate(appKey: string, authorization?: string) {
    const app = await this.db.application.findUnique({ where: { key: appKey } });
    if (!app || !app.enabled) throw new UnauthorizedException('应用不存在或已停用');
    if (authorization !== undefined) {
      const match = /^Bearer (md_[A-Za-z0-9_-]{43})$/i.exec(authorization);
      const key = match
        ? await this.db.apiKey.findUnique({ where: { hash: sha256(match[1]!) } })
        : null;
      if (!key || key.revokedAt) throw new UnauthorizedException('API Key 无效或已撤销');
      if (key.applicationId !== app.id) throw new ForbiddenException('API Key 不属于该应用');
    } else if (app.authMode !== 'none')
      throw new UnauthorizedException('请通过 Authorization: Bearer <API_KEY> 提供密钥');
    return app;
  }
  async accept(appId: string, input: NotificationInput, idempotencyKey: string) {
    if (!/^[\x21-\x7E]{1,200}$/.test(idempotencyKey))
      throw new BadRequestException('Idempotency-Key 必须是 1–200 个可见 ASCII 字符');
    const app = await this.db.application.findUnique({ where: { id: appId } });
    if (!app || !app.enabled) throw new ForbiddenException('应用已停用');
    if (!(await this.redis.limit(`app-limit:${app.id}`, app.perMinuteLimit)))
      throw new HttpException('应用发送频率超限', 429);
    const hash = requestHash({
      ...input,
      expires_in: input.expires_in ?? 3600,
      variables: input.variables ?? {},
    });
    const existing = await this.db.notification.findUnique({
      where: { applicationId_idempotencyKey: { applicationId: app.id, idempotencyKey } },
      include: { _count: { select: { deliveries: true } } },
    });
    if (existing) {
      if (existing.requestHash !== hash) throw new ConflictException('相同幂等键对应不同请求');
      return {
        notification_id: existing.id,
        status: 'accepted_for_processing',
        delivery_count: existing._count.deliveries,
        idempotency_hit: true,
      };
    }
    if (Boolean(input.message) === Boolean(input.template))
      throw new BadRequestException('message 与 template 必须且只能提供一个');
    let ids: string[];
    if (input.target.type === 'topic') {
      const topic = await this.db.topic.findUnique({ where: { key: input.target.key ?? '' } });
      if (!topic) throw new BadRequestException('主题不存在');
      ids = topic.targetIds;
    } else ids = input.target.ids ?? [];
    ids = [...new Set(ids)];
    if (!ids.length || ids.length > 500) throw new BadRequestException('目标数量必须为 1–500');
    if (ids.some((id) => !app.allowedTargetIds.includes(id)))
      throw new ForbiddenException('应用无权访问目标');
    const targets = await this.db.target.findMany({
      where: { id: { in: ids } },
      include: { channel: true },
    });
    if (targets.length !== ids.length || targets.some((t) => !t.channel.enabled))
      throw new BadRequestException('目标不存在或渠道已停用');
    let text = input.message?.text ?? '';
    let versionId: string | undefined;
    if (input.template) {
      const template = await this.db.template.findUnique({
        where: { key: input.template.key },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = template?.versions[0];
      if (!version) throw new BadRequestException('模板不存在');
      text = renderText(version.body, input.variables ?? {});
      versionId = version.id;
    }
    if (!text.trim() || Buffer.byteLength(text, 'utf8') > 2000)
      throw new BadRequestException('消息不能为空且最多 2000 字节');
    const queued = await this.db.delivery.count({
      where: { status: { in: ['pending', 'retry_wait', 'sending'] } },
    });
    if (queued + ids.length > 100000) throw new HttpException('投递积压达到受理上限', 503);
    const expiresAt = new Date(Date.now() + (input.expires_in ?? 3600) * 1000);
    try {
      return await this.db.$transaction(async (tx) => {
        const notice = await tx.notification.create({
          data: {
            applicationId: app.id,
            idempotencyKey,
            requestHash: hash,
            event: input.event,
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
          where: { applicationId_idempotencyKey: { applicationId: app.id, idempotencyKey } },
          include: { _count: { select: { deliveries: true } } },
        });
        if (notice?.requestHash === hash)
          return {
            notification_id: notice.id,
            status: 'accepted_for_processing',
            delivery_count: notice._count.deliveries,
            idempotency_hit: true,
          };
        throw new ConflictException('幂等请求冲突');
      }
      throw error;
    }
  }
  async query(appId: string, id: string) {
    const notification = await this.db.notification.findFirst({
      where: { id, applicationId: appId },
      select: {
        id: true,
        event: true,
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
    if (!notification) throw new NotFoundException('通知不存在');
    return notification;
  }
  async queryDeliveries(appId: string, id: string, cursor?: string) {
    await this.query(appId, id);
    const items = await this.db.delivery.findMany({
      where: { notificationId: id, notification: { applicationId: appId } },
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
    return { items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49]!.id : null };
  }
  async queryDelivery(appId: string, id: string) {
    const delivery = await this.db.delivery.findFirst({
      where: { id, notification: { applicationId: appId } },
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
    if (!delivery) throw new NotFoundException('投递不存在');
    return delivery;
  }
  async adminTest(applicationId: string, targetIds: string[], text: string, actor: string) {
    const result = await this.accept(
      applicationId,
      { event: 'msgdock.test', target: { type: 'targets', ids: targetIds }, message: { text } },
      `test-${randomUUID()}`,
    );
    await this.db.audit.create({
      data: { actor, action: 'notification.test', resource: result.notification_id, details: {} },
    });
    return result;
  }
}
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
