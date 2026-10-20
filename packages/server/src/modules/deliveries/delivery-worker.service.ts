import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  ChannelCredentials,
  ChannelType,
  SendJob,
  SendOutcome,
  TargetConfig,
} from '@msgdock/contracts';
import { sendMessage } from '@msgdock/channels';
import {
  DatabaseService,
  RedisService,
  SecretService,
  redisConnection,
} from '../../infrastructure';
import { deliveryResult } from './policy';

@Injectable()
export class DeliveryWorkerService implements OnModuleInit, OnModuleDestroy {
  private queue = new Queue<SendJob>('msgdock-send', {
    connection: redisConnection(),
    defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
  });
  private worker?: Worker<SendJob>;
  private timer?: NodeJS.Timeout;
  private busy = false;
  private shuttingDown = false;
  private readonly logger = new Logger('DeliveryWorker');
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly secrets: SecretService,
  ) {}
  async onModuleInit() {
    this.queue.on('error', () => {});
    this.worker = new Worker<SendJob>('msgdock-send', (job) => this.process(job.data), {
      connection: redisConnection(),
      concurrency: 8,
      lockDuration: 60000,
    });
    this.worker.on('error', () => this.logger.warn('队列连接暂时不可用'));
    this.worker.on('failed', () => this.logger.warn('执行中断，将依据数据库中的状态恢复'));
    this.timer = setInterval(() => void this.tick(), 1000);
    await this.tick();
  }
  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue.close();
  }
  private async tick() {
    if (this.busy || this.shuttingDown) return;
    this.busy = true;
    try {
      await this.redis.client.ping();
      const now = new Date();
      const stale = await this.db.delivery.findMany({
        where: { status: 'sending', leaseExpiresAt: { lt: now } },
        take: 100,
      });
      for (const d of stale)
        await this.db.$transaction(async (tx) => {
          const changed = await tx.delivery.updateMany({
            where: {
              id: d.id,
              status: 'sending',
              leaseToken: d.leaseToken,
              leaseExpiresAt: { lt: now },
            },
            data: d.requestStartedAt
              ? {
                  status: 'unknown',
                  lastCode: 'lease_expired',
                  lastMessage: '执行者失联，发送结果待核实',
                }
              : {
                  status: 'pending',
                  generation: { increment: 1 },
                  leaseToken: null,
                  leaseExpiresAt: null,
                  nextAttemptAt: now,
                },
          });
          if (changed.count && !d.requestStartedAt)
            await tx.outbox.create({ data: { deliveryId: d.id, generation: d.generation + 1 } });
        });
      await this.db.delivery.updateMany({
        where: { status: { in: ['pending', 'retry_wait'] }, expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
      const events = await this.db.outbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const event of events) {
        const d = await this.db.delivery.findUnique({ where: { id: event.deliveryId } });
        if (d && ['pending', 'retry_wait'].includes(d.status) && d.generation === event.generation)
          await this.enqueue(d.id, d.generation, d.nextAttemptAt);
        await this.db.outbox.update({ where: { id: event.id }, data: { publishedAt: now } });
      }
      const due = await this.db.delivery.findMany({
        where: {
          status: { in: ['pending', 'retry_wait'] },
          nextAttemptAt: { lte: now },
          expiresAt: { gt: now },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 100,
      });
      for (const d of due) await this.enqueue(d.id, d.generation, d.nextAttemptAt);
      await this.db.runtimeState.upsert({
        where: { key: 'worker_heartbeat' },
        create: { key: 'worker_heartbeat', value: 'ready' },
        update: { value: 'ready' },
      });
      await this.db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    } catch {
      this.logger.warn('调度暂停，等待数据库或队列恢复');
    } finally {
      this.busy = false;
    }
  }
  private async enqueue(id: string, generation: number, at: Date) {
    await this.queue.add(
      'send',
      { deliveryId: id, generation },
      { jobId: `d-${id}-g-${generation}`, delay: Math.max(0, at.getTime() - Date.now()) },
    );
  }
  private async quota(channelId: string, type: string) {
    const capacity = type === 'feishu.group_webhook' ? 60 : 20;
    const script =
      "local t=redis.call('TIME'); local now=t[1]*1000+t[2]/1000; local v=redis.call('HMGET',KEYS[1],'tokens','time'); local tokens=tonumber(v[1]) or tonumber(ARGV[1]); local last=tonumber(v[2]) or now; tokens=math.min(tonumber(ARGV[1]),tokens+math.max(0,now-last)*tonumber(ARGV[1])/60000); local wait=0; if tokens>=1 then tokens=tokens-1 else wait=math.ceil((1-tokens)*60000/tonumber(ARGV[1])) end; redis.call('HSET',KEYS[1],'tokens',tokens,'time',now); redis.call('PEXPIRE',KEYS[1],120000); return wait";
    return Number(await this.redis.client.eval(script, 1, `channel-quota:${channelId}`, capacity));
  }
  private async process(job: SendJob) {
    if (this.shuttingDown) return;
    const d = await this.db.delivery.findUnique({
      where: { id: job.deliveryId },
      include: { notification: { include: { application: true } } },
    });
    if (
      !d ||
      d.generation !== job.generation ||
      !['pending', 'retry_wait'].includes(d.status) ||
      d.nextAttemptAt.getTime() > Date.now()
    )
      return;
    const channel = await this.db.channel.findUnique({ where: { id: d.channelId } });
    const app = d.notification.application;
    if (!channel?.enabled || !app.enabled || !app.allowedTargetIds.includes(d.targetId)) {
      await this.db.delivery.updateMany({
        where: { id: d.id, generation: job.generation, status: { in: ['pending', 'retry_wait'] } },
        data: {
          status: 'cancelled',
          lastCode: 'authorization_revoked',
          lastMessage: '应用或渠道停用，或目标授权被撤回',
        },
      });
      return;
    }
    const wait = await this.quota(d.channelId, channel.type);
    if (wait > 0) {
      await this.db.$transaction(async (tx) => {
        const changed = await tx.delivery.updateMany({
          where: {
            id: d.id,
            generation: job.generation,
            status: { in: ['pending', 'retry_wait'] },
          },
          data: { generation: { increment: 1 }, nextAttemptAt: new Date(Date.now() + wait) },
        });
        if (changed.count)
          await tx.outbox.create({ data: { deliveryId: d.id, generation: job.generation + 1 } });
      });
      return;
    }
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.db.$transaction(async (tx) => {
      const changed = await tx.delivery.updateMany({
        where: {
          id: d.id,
          generation: job.generation,
          status: { in: ['pending', 'retry_wait'] },
          expiresAt: { gt: now },
          nextAttemptAt: { lte: now },
        },
        data: {
          status: 'sending',
          leaseToken: token,
          leaseExpiresAt: new Date(Date.now() + 60000),
          requestStartedAt: null,
        },
      });
      if (!changed.count) return false;
      await tx.attempt.create({ data: { deliveryId: d.id, token, number: d.attemptCount + 1 } });
      return true;
    });
    if (!claimed) return;
    let started = false;
    let outcome: SendOutcome;
    try {
      outcome = await sendMessage({
        type: channel.type as ChannelType,
        credentials: this.secrets.decrypt<ChannelCredentials>(channel.credentials),
        target: d.targetSnapshot as TargetConfig,
        text: d.text,
        timeoutMs: Number(process.env.MSGDOCK_SEND_TIMEOUT_MS ?? 10000),
        beforeRequest: async () => {
          await this.db.$transaction(async (tx) => {
            const currentApp = await tx.application.findUnique({ where: { id: app.id } });
            const currentChannel = await tx.channel.findUnique({ where: { id: channel.id } });
            if (
              !currentApp?.enabled ||
              !currentApp.allowedTargetIds.includes(d.targetId) ||
              !currentChannel?.enabled
            )
              throw new Error('Authorization revoked');
            const result = await tx.delivery.updateMany({
              where: {
                id: d.id,
                status: 'sending',
                leaseToken: token,
                expiresAt: { gt: new Date() },
                leaseExpiresAt: { gt: new Date() },
              },
              data: { requestStartedAt: new Date(), attemptCount: { increment: 1 } },
            });
            if (!result.count) throw new Error('Lease no longer valid');
            await tx.attempt.update({
              where: { token },
              data: { status: 'sending', requestStartedAt: new Date() },
            });
          });
          started = true;
        },
      });
    } catch {
      outcome = {
        kind: started ? 'unknown' : 'failed',
        code: 'execution_failed',
        message: started ? '发送结果不明，请核实' : '发送前校验失败',
      };
    }
    const result = deliveryResult(outcome, d.attemptCount + (started ? 1 : 0), d.expiresAt);
    await this.db.$transaction(async (tx) => {
      await tx.attempt.update({
        where: { token },
        data: {
          status: outcome.kind,
          code: 'code' in outcome ? outcome.code : null,
          message: 'message' in outcome ? outcome.message : null,
          finishedAt: new Date(),
        },
      });
      const changed = await tx.delivery.updateMany({
        where: {
          id: d.id,
          generation: job.generation,
          leaseToken: token,
          status: { in: outcome.kind === 'accepted' ? ['sending', 'unknown'] : ['sending'] },
        },
        data: {
          status: result.status,
          nextAttemptAt: result.nextAttemptAt ?? d.nextAttemptAt,
          leaseExpiresAt: null,
          lastCode: 'code' in outcome ? outcome.code : null,
          lastMessage: 'message' in outcome ? outcome.message : null,
          platformMessageId: 'platformMessageId' in outcome ? outcome.platformMessageId : null,
          ...(result.status === 'retry_wait' ? { generation: { increment: 1 } } : {}),
        },
      });
      if (changed.count && result.status === 'retry_wait')
        await tx.outbox.create({ data: { deliveryId: d.id, generation: job.generation + 1 } });
      await tx.channel.update({
        where: { id: channel.id },
        data: {
          lastStatus:
            outcome.kind === 'accepted'
              ? 'healthy'
              : outcome.kind === 'unknown'
                ? 'uncertain'
                : 'error',
          lastCheckedAt: new Date(),
        },
      });
    });
  }
}
@Module({ providers: [DeliveryWorkerService] })
export class DeliveryWorkerModule {}
