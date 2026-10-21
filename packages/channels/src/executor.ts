import { createHash } from 'node:crypto';
import { ChannelAdapter, ConfigValues, PluginHttpClient, SendOutcome } from '@msgdock/plugin-sdk';
import { ChannelRegistry } from './registry';

export interface ExecuteInput {
  channelId: string;
  pluginId: string;
  pluginVersion: string;
  configVersion: number;
  credentials: ConfigValues;
  target: ConfigValues;
  text: string;
  timeoutMs?: number;
  beforeRequest(): Promise<void>;
}
interface RuntimeEntry {
  channelId: string;
  adapter: ChannelAdapter;
  ready: Promise<void>;
  active: number;
  retired: boolean;
}

/** Trusted plugins share this process. The HTTP boundary is not a hostile-code sandbox. */
export class ChannelExecutor {
  private readonly runtimes = new Map<string, RuntimeEntry>();
  constructor(private readonly registry: ChannelRegistry) {}

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.runtimes.values()].map(async (entry) => {
        try {
          await entry.ready;
        } finally {
          await entry.adapter.stop?.();
        }
      }),
    );
    this.runtimes.clear();
  }

  private async release(key: string, entry: RuntimeEntry): Promise<void> {
    if (entry.retired && entry.active === 0 && this.runtimes.get(key) === entry) {
      this.runtimes.delete(key);
      try {
        try {
          await entry.ready;
        } finally {
          await entry.adapter.stop?.();
        }
      } catch {
        /* no secrets in logs */
      }
    }
  }

  async execute(input: ExecuteInput): Promise<SendOutcome> {
    let started = false;
    let authRequestStarted = false;
    let requestReserved = false;
    let closed = false;
    const pendingRequests: Promise<Response>[] = [];
    let entered = false;
    let key = '';
    let runtime: RuntimeEntry | undefined;
    try {
      const plugin = this.registry.get(input.pluginId, input.pluginVersion);
      const descriptor = plugin.descriptor;
      if (descriptor.configVersion !== input.configVersion)
        return {
          kind: 'failed',
          code: 'config_version_mismatch',
          message: '渠道配置版本与投递快照不兼容',
        };
      this.registry.validate(input.pluginId, input.pluginVersion, input.credentials, input.target);
      if (Buffer.byteLength(input.text, 'utf8') > descriptor.capabilities.maxTextBytes)
        return { kind: 'failed', code: 'message_too_large', message: '文本超过插件声明的大小限制' };
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(input.credentials))
        .digest('hex');
      key = `${input.channelId}:${input.pluginId}@${input.pluginVersion}:${fingerprint}`;
      runtime = this.runtimes.get(key);
      if (!runtime) {
        for (const [oldKey, old] of this.runtimes) {
          if (old.channelId === input.channelId && oldKey !== key) {
            old.retired = true;
            await this.release(oldKey, old);
          }
        }
        runtime = this.runtimes.get(key);
        if (!runtime) {
          const adapter = plugin.create({ now: Date.now }, input.credentials);
          runtime = {
            channelId: input.channelId,
            adapter,
            active: 0,
            retired: false,
            ready: Promise.resolve(),
          };
          this.runtimes.set(key, runtime);
          runtime.ready = Promise.resolve().then(() => adapter.start?.());
        }
      }
      runtime.active++;
      entered = true;
      await runtime.ready;
      const http: PluginHttpClient = {
        post: (request) => {
          const pending = (async () => {
            if (closed) throw new Error('本次插件调用已结束');
            if (!['auth', 'delivery'].includes(request.purpose)) throw new Error('无效的请求用途');
            const url = new URL(request.url);
            const test =
              descriptor.testOnly === true &&
              /^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):\d+\/send$/.test(url.href);
            if (
              !descriptor.network.allowedHosts.includes(url.hostname) ||
              url.username ||
              url.password ||
              url.hash ||
              (!test && (url.protocol !== 'https:' || url.port))
            )
              throw new Error('插件出站地址不允许');
            if (request.purpose === 'delivery') {
              if (requestReserved) throw new Error('一次投递尝试仅允许一次消息请求');
              requestReserved = true;
              await input.beforeRequest();
              started = true;
            }
            if (request.purpose === 'auth') authRequestStarted = true;
            return fetch(url, {
              method: 'POST',
              redirect: 'error',
              headers: { 'content-type': 'application/json', ...request.headers },
              body: JSON.stringify(request.body),
              signal: AbortSignal.timeout(input.timeoutMs ?? 10000),
            });
          })();
          pendingRequests.push(pending);
          void pending.catch(() => {});
          return pending;
        },
      };
      const outcome = await runtime.adapter.send({ text: input.text, target: input.target, http });
      closed = true;
      const requests = await Promise.allSettled(pendingRequests);
      if (requests.some((result) => result.status === 'rejected'))
        throw new Error('插件请求未完成');
      if (outcome.kind === 'accepted' && !started)
        return { kind: 'failed', code: 'plugin_protocol_error', message: '插件未通过宿主发送消息' };
      return outcome;
    } catch {
      closed = true;
      await Promise.allSettled(pendingRequests);
      return started
        ? {
            kind: 'unknown',
            code: 'network_uncertain',
            message: '请求已开始但未取得确定响应，请核实后处理',
          }
        : authRequestStarted
          ? { kind: 'retry', code: 'preflight_failed', message: '平台鉴权准备失败，尚未发出消息' }
          : {
              kind: 'failed',
              code: 'plugin_execution_failed',
              message: '插件不可用、配置无效或执行准备失败',
            };
    } finally {
      if (runtime && entered) {
        runtime.active--;
        await this.release(key, runtime);
      }
    }
  }
}
