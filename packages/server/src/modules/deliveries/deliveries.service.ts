import { ServiceError } from '../../errors';
import { Injectable, Module } from '@nestjs/common';
import { Prisma } from '@msgdock/database';
import { channelRegistry } from '@msgdock/channels';
import { DatabaseService } from '../../infrastructure';
import { deliveryView } from './view';

@Injectable()
export class DeliveriesService {
  constructor(private readonly db: DatabaseService) {}
  async list(filter: { status?: string; applicationId?: string; cursor?: string }) {
    const where: Prisma.DeliveryWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.applicationId ? { notification: { applicationId: filter.applicationId } } : {}),
    };
    const rows = await this.db.delivery.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        targetName: true,
        attemptCount: true,
        createdAt: true,
        lastCode: true,
        lastMessage: true,
        replayOfDeliveryId: true,
        channelId: true,
        notification: {
          select: { application: { select: { id: true, name: true, key: true } } },
        },
      },
    });
    return {
      items: rows.slice(0, 50).map(deliveryView),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async detail(id: string) {
    const result = await this.db.delivery.findUnique({
      where: { id },
      include: {
        attempts: { orderBy: { startedAt: 'asc' } },
        notification: { include: { application: { select: { name: true, key: true } } } },
      },
    });
    if (!result) throw new ServiceError('DELIVERY_NOT_FOUND');
    return deliveryView(result);
  }
  async cancel(id: string, actor: string) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.delivery.updateMany({
        where: { id, status: { in: ['pending', 'retry_wait'] } },
        data: { status: 'cancelled', generation: { increment: 1 } },
      });
      if (!result.count)
        throw new ServiceError('DELIVERY_STATE_CONFLICT', '只有排队或等待重试的投递可以取消');
      await tx.audit.create({
        data: { actor, action: 'delivery.cancel', resource: id, details: {} },
      });
      return { ok: true };
    });
  }
  async replay(id: string, actor: string, reason: string, confirmed: boolean) {
    return this.db.$transaction(async (tx) => {
      const source = await tx.delivery.findUnique({
        where: { id },
        include: { notification: { include: { application: true } } },
      });
      if (!source) throw new ServiceError('DELIVERY_NOT_FOUND');
      if (!['failed', 'expired', 'unknown', 'cancelled'].includes(source.status))
        throw new ServiceError('DELIVERY_STATE_CONFLICT', '当前状态不允许重发');
      if (source.status === 'unknown' && !confirmed)
        throw new ServiceError('DELIVERY_CONFIRMATION_REQUIRED');
      const app = source.notification.application;
      if (!app.enabled || !app.allowedTargetIds.includes(source.targetId))
        throw new ServiceError('APPLICATION_ACCESS_REVOKED');
      const target = await tx.target.findUnique({
        where: { id: source.targetId },
        include: { channel: true },
      });
      if (!target?.channel.enabled) throw new ServiceError('CHANNEL_DISABLED');
      try {
        const descriptor = channelRegistry.get(source.pluginId, source.pluginVersion).descriptor;
        if (
          target.channel.type !== source.pluginId ||
          target.channel.configVersion !== source.configVersion ||
          descriptor.configVersion !== source.configVersion
        )
          throw new Error('插件配置版本不兼容');
      } catch {
        throw new ServiceError(
          'CHANNEL_PLUGIN_UNAVAILABLE',
          '原投递的插件版本不可用；请使用当前渠道重新创建通知',
        );
      }
      const fresh = await tx.delivery.create({
        data: {
          notificationId: source.notificationId,
          channelId: source.channelId,
          targetId: source.targetId,
          targetName: source.targetName,
          targetSnapshot: source.targetSnapshot as Prisma.InputJsonValue,
          pluginId: source.pluginId,
          pluginVersion: source.pluginVersion,
          configVersion: source.configVersion,
          text: source.text,
          expiresAt: new Date(Date.now() + 3600000),
          replayOfDeliveryId: id,
        },
      });
      await tx.outbox.create({ data: { deliveryId: fresh.id, generation: 0 } });
      await tx.audit.create({
        data: {
          actor,
          action: 'delivery.replay',
          resource: id,
          details: { newDeliveryId: fresh.id, reason, confirmed },
        },
      });
      return { delivery_id: fresh.id };
    });
  }
  async resolve(id: string, actor: string, reason: string) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.delivery.updateMany({
        where: { id, status: 'unknown' },
        data: {
          status: 'accepted',
          lastCode: 'manually_verified',
          lastMessage: '管理员核实平台已接受',
        },
      });
      if (!result.count)
        throw new ServiceError('DELIVERY_STATE_CONFLICT', '仅支持核实结果待确认的投递');
      await tx.audit.create({
        data: { actor, action: 'delivery.resolve', resource: id, details: { reason } },
      });
      return { ok: true };
    });
  }
  async overview() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const yesterday = new Date(start.getTime() - 86400000);
    const week = new Date(start.getTime() - 6 * 86400000);
    const [
      groups,
      previous,
      channels,
      applications,
      latest,
      hours,
      days,
      oldest,
      pendingCount,
      unknownCount,
    ] = await Promise.all([
      this.db.delivery.groupBy({
        by: ['status'],
        where: { createdAt: { gte: start } },
        _count: true,
      }),
      this.db.delivery.count({
        where: { createdAt: { gte: yesterday, lt: new Date(Date.now() - 86400000) } },
      }),
      this.db.channel.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          enabled: true,
          lastStatus: true,
          lastCheckedAt: true,
          _count: { select: { targets: true } },
        },
      }),
      this.db.application.count(),
      this.list({}),
      this.db.$queryRaw<
        { bucket: Date; count: bigint }[]
      >`SELECT date_trunc('hour',"createdAt" AT TIME ZONE 'UTC',${process.env.TZ ?? 'Asia/Shanghai'}) AS bucket,count(*)::bigint AS count FROM "Delivery" WHERE "createdAt">=${start} GROUP BY bucket ORDER BY bucket`,
      this.db.$queryRaw<
        { bucket: Date; count: bigint }[]
      >`SELECT date_trunc('day',"createdAt" AT TIME ZONE 'UTC',${process.env.TZ ?? 'Asia/Shanghai'}) AS bucket,count(*)::bigint AS count FROM "Delivery" WHERE "createdAt">=${week} GROUP BY bucket ORDER BY bucket`,
      this.db.delivery.findFirst({
        where: { status: { in: ['pending', 'retry_wait'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.db.delivery.count({ where: { status: { in: ['pending', 'retry_wait', 'sending'] } } }),
      this.db.delivery.count({ where: { status: 'unknown' } }),
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g.status, g._count]));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      total,
      counts,
      pendingCount,
      unknownCount,
      previous,
      channels,
      applications,
      recent: latest.items.slice(0, 5),
      hours: hours.map((h) => ({ time: h.bucket.toISOString(), count: Number(h.count) })),
      days: days.map((h) => ({ time: h.bucket.toISOString(), count: Number(h.count) })),
      oldestWaitingSeconds: oldest
        ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000)
        : 0,
    };
  }
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    const worker = await this.db.runtimeState.findUnique({ where: { key: 'worker_heartbeat' } });
    return {
      workerReady: !!worker && Date.now() - worker.updatedAt.getTime() < 30000,
      workerLastSeen: worker?.updatedAt ?? null,
    };
  }
}
@Module({ providers: [DeliveriesService], exports: [DeliveriesService] })
export class DeliveriesModule {}
