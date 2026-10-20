import { createHmac } from 'node:crypto';
import {
  CHANNEL_TYPES,
  ChannelCredentials,
  ChannelType,
  SendContext,
  SendOutcome,
} from '@msgdock/contracts';

export function validateCredentials(type: ChannelType, credentials: ChannelCredentials): void {
  if (type === 'mock' && process.env.MSGDOCK_TEST_MODE === 'true') return;
  if (!CHANNEL_TYPES.includes(type as (typeof CHANNEL_TYPES)[number]))
    throw new Error('不支持的渠道类型');
  if (type === 'dingtalk.enterprise_bot') {
    if (!credentials.appKey || !credentials.appSecret || !credentials.robotCode)
      throw new Error('请填写 AppKey、AppSecret 和 RobotCode');
    return;
  }
  let url: URL;
  try {
    url = new URL(credentials.webhookUrl ?? '');
  } catch {
    throw new Error('Webhook 地址无效');
  }
  const valid =
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash &&
    (type === 'wecom.group_webhook'
      ? url.hostname === 'qyapi.weixin.qq.com' &&
        url.pathname === '/cgi-bin/webhook/send' &&
        !!url.searchParams.get('key') &&
        [...url.searchParams.keys()].every((k) => k === 'key')
      : url.hostname === 'open.feishu.cn' &&
        /^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(url.pathname) &&
        !url.search);
  if (!valid) throw new Error('请使用该平台官方 HTTPS Webhook 地址');
}

export function feishuSignature(timestamp: string, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}

async function post(
  url: string,
  body: unknown,
  timeoutMs: number,
  headers: Record<string, string> = {},
) {
  return fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function sendMessage(context: SendContext): Promise<SendOutcome> {
  const { type, credentials, target, text, beforeRequest } = context;
  const timeout = context.timeoutMs ?? 10000;
  validateCredentials(type, credentials);
  if (Buffer.byteLength(text, 'utf8') > 2000)
    return {
      kind: 'failed',
      code: 'message_too_large',
      message: '文本超过首版统一限制（2000 字节）',
    };
  let started = false;
  try {
    let endpoint = credentials.webhookUrl!;
    let headers: Record<string, string> = {};
    let body: unknown;
    if (type === 'wecom.group_webhook') body = { msgtype: 'text', text: { content: text } };
    else if (type === 'feishu.group_webhook') {
      const timestamp = String(Math.floor(Date.now() / 1000));
      body = {
        msg_type: 'text',
        content: { text },
        ...(credentials.secret
          ? { timestamp, sign: feishuSignature(timestamp, credentials.secret) }
          : {}),
      };
    } else if (type === 'dingtalk.enterprise_bot') {
      if (!target.openConversationId)
        return {
          kind: 'failed',
          code: 'missing_conversation',
          message: '未配置目标 OpenConversationId',
        };
      const tokenResponse = await post(
        'https://api.dingtalk.com/v1.0/oauth2/accessToken',
        { appKey: credentials.appKey, appSecret: credentials.appSecret },
        timeout,
      );
      const token = (await tokenResponse.json()) as { accessToken?: string };
      if (!tokenResponse.ok || !token.accessToken)
        return {
          kind: tokenResponse.status >= 500 ? 'retry' : 'failed',
          code: 'token_failed',
          message: '钉钉应用凭证获取失败',
        };
      endpoint = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send';
      headers = { 'x-acs-dingtalk-access-token': token.accessToken };
      body = {
        robotCode: credentials.robotCode,
        openConversationId: target.openConversationId,
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: text }),
      };
    } else {
      endpoint = process.env.MSGDOCK_TEST_SERVER ?? '';
      body = { text };
      if (!/^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):\d+\/send$/.test(endpoint))
        throw new Error('Test endpoint not configured');
    }
    await beforeRequest();
    started = true;
    const response = await post(endpoint, body, timeout, headers);
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after') ?? 5);
      return {
        kind: 'retry',
        code: 'rate_limited',
        message: '平台限流，等待重试',
        retryAfterMs: Number.isFinite(seconds)
          ? Math.min(300000, Math.max(1000, seconds * 1000))
          : 5000,
      };
    }
    if (response.status >= 500)
      return { kind: 'unknown', code: 'upstream_5xx', message: '平台返回服务错误，结果待核实' };
    if (!response.ok)
      return {
        kind: 'failed',
        code: `http_${response.status}`,
        message: '平台拒绝请求，请检查渠道配置与权限',
      };
    const data = (await response.json()) as Record<string, unknown>;
    const code = data.errcode ?? data.code ?? data.StatusCode;
    if (code !== undefined && code !== 0 && code !== '0') {
      if ([45009, 45011, 130101, 11232, 99991400].includes(Number(code)))
        return { kind: 'retry', code: String(code), message: '平台限流，等待重试' };
      return {
        kind: 'failed',
        code: String(code).slice(0, 80),
        message: '平台业务校验未通过，请检查凭证、权限或消息规则',
      };
    }
    return {
      kind: 'accepted',
      platformMessageId:
        typeof data.processQueryKey === 'string' ? data.processQueryKey : undefined,
    };
  } catch {
    return started
      ? {
          kind: 'unknown',
          code: 'network_uncertain',
          message: '请求已开始但未取得确定响应，请核实后处理',
        }
      : { kind: 'retry', code: 'preflight_failed', message: '发送前准备失败，尚未发出消息' };
  }
}
