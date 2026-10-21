import { wecomWebhook } from '@msgdock/plugin-wecom-webhook';
import { feishuWebhook } from '@msgdock/plugin-feishu-webhook';
import { dingtalkBot } from '@msgdock/plugin-dingtalk-bot';
import { mockPlugin } from '@msgdock/plugin-mock';
import { ChannelRegistry } from './registry';

/** The only composition point for built-in plugins. API and Worker use the same catalog. */
export function createBuiltinRegistry(options: { testEndpoint?: string } = {}): ChannelRegistry {
  const registry = new ChannelRegistry()
    .register(wecomWebhook)
    .register(feishuWebhook)
    .register(dingtalkBot);
  if (options.testEndpoint) registry.register(mockPlugin(options.testEndpoint));
  return registry;
}
export const channelRegistry = createBuiltinRegistry(
  process.env.MSGDOCK_TEST_MODE === 'true'
    ? { testEndpoint: process.env.MSGDOCK_TEST_SERVER ?? 'http://127.0.0.1:3320/send' }
    : {},
);
