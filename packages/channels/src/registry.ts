import Ajv, { ValidateFunction } from 'ajv';
import {
  ChannelPlugin,
  ConfigValues,
  PluginDescriptor,
  SDK_API_VERSION,
} from '@msgdock/plugin-sdk';

interface RegisteredPlugin {
  plugin: ChannelPlugin;
  config: ValidateFunction;
  target: ValidateFunction;
}

/** Explicit startup registration. Registering a new version does not remove older versions. */
export class ChannelRegistry {
  private readonly versions = new Map<string, RegisteredPlugin>();
  private readonly active = new Map<string, string>();
  private readonly ajv = new Ajv({ allErrors: true, strict: true, ownProperties: true });

  register(plugin: ChannelPlugin): this {
    const d = plugin.descriptor;
    if (d.sdkApiVersion !== SDK_API_VERSION) throw new Error(`插件 SDK 不兼容：${d.id}`);
    if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(d.id) || !/^\d+\.\d+\.\d+$/.test(d.version))
      throw new Error('插件标识或版本无效');
    if (
      !Number.isInteger(d.configVersion) ||
      d.configVersion < 1 ||
      !Number.isInteger(d.rateLimit.capacity) ||
      d.rateLimit.capacity < 1 ||
      !Number.isInteger(d.rateLimit.intervalMs) ||
      d.rateLimit.intervalMs < 1 ||
      !Number.isInteger(d.capabilities.maxTextBytes) ||
      d.capabilities.maxTextBytes < 1 ||
      d.capabilities.transport !== 'http' ||
      !d.capabilities.messageTypes.includes('text')
    )
      throw new Error(`插件能力或限额声明无效：${d.id}`);
    for (const section of ['config', 'target'] as const) {
      const schema = section === 'config' ? d.configSchema : d.targetSchema;
      if (
        schema.type !== 'object' ||
        schema.additionalProperties !== false ||
        Object.entries(schema.properties).some(
          ([key, field]) =>
            !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key) ||
            !['string', 'boolean', 'integer'].includes(field.type) ||
            !d.uiSchema[section][key]?.label,
        ) ||
        schema.required.some((key) => !Object.hasOwn(schema.properties, key))
      )
        throw new Error(`插件配置 Schema 不受支持：${d.id}`);
    }
    const key = `${d.id}@${d.version}`;
    if (this.versions.has(key)) throw new Error(`插件版本重复：${key}`);
    this.versions.set(key, {
      plugin,
      config: this.ajv.compile(d.configSchema),
      target: this.ajv.compile(d.targetSchema),
    });
    this.active.set(d.id, d.version);
    return this;
  }

  get(id: string, version?: string): ChannelPlugin {
    const entry = this.versions.get(`${id}@${version ?? this.active.get(id)}`);
    if (!entry) throw new Error(`插件版本不可用：${id}@${version ?? 'active'}`);
    return entry.plugin;
  }

  list(): PluginDescriptor[] {
    return [...this.versions.values()].map(({ plugin }) => structuredClone(plugin.descriptor));
  }

  validate(id: string, version: string, config: ConfigValues, target: ConfigValues): void {
    const plugin = this.get(id, version);
    const entry = this.versions.get(`${id}@${version}`)!;
    for (const [label, validate, values] of [
      ['渠道配置', entry.config, config],
      ['接收目标', entry.target, target],
    ] as const) {
      if (!validate(values)) {
        const error = validate.errors?.[0];
        // Never include received values, which can be credentials, in an error or log.
        throw new Error(
          `${label}不符合插件 Schema：${error?.instancePath || '/'} ${error?.message ?? ''}`,
        );
      }
    }
    plugin.validateConfig?.(config);
  }
}
