import { useState } from 'react';
import { Alert, Button, Card, Select, Steps, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getApplications } from '../applications/api';
import { getTargets } from '../channels/api';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';
export function DocsPage() {
  const apps = useQuery({ queryKey: ['applications'], queryFn: getApplications });
  const targets = useQuery({ queryKey: ['targets'], queryFn: getTargets });
  const [id, setId] = useState<string>();
  const app = apps.data?.find((a) => a.id === id) ?? apps.data?.[0];
  const target = targets.data?.find((t) => app?.allowedTargetIds.includes(t.id));
  const example = [
    `curl -X POST '${location.origin}/api/v1/apps/${app?.key ?? 'order-service'}/notifications'`,
    ...(app?.authMode === 'none' ? [] : ["  -H 'Authorization: Bearer <API_KEY>'"]),
    "  -H 'Content-Type: application/json'",
    "  -H 'Idempotency-Key: order-20261020-001'",
    `  -d '${JSON.stringify({ event: 'order.paid', target: { type: 'targets', ids: [target?.id ?? '<TARGET_ID>'] }, message: { text: '订单支付成功。' }, expires_in: 3600 }, null, 2)}'`,
  ].join(' \\\n');
  return (
    <>
      <PageTitle
        title="API 文档"
        description="从业务服务端调用统一 HTTP API，即可发送多渠道通知。"
        actions={
          <Button href="/openapi.json" target="_blank">
            查看 OpenAPI JSON ↗
          </Button>
        }
      />
      <DocsNavigation />
      <Card title="接入步骤">
        <Steps
          size="small"
          items={[
            { title: '配置渠道' },
            { title: '授权应用目标' },
            { title: '生成 API Key' },
            { title: '发送与查询' },
          ]}
        />
      </Card>
      <Card
        title="发送通知"
        className="mt20"
        extra={
          <Select
            aria-label="文档示例应用"
            style={{ minWidth: 160 }}
            value={app?.id}
            placeholder="选择应用"
            onChange={setId}
            options={apps.data?.map((a) => ({ label: a.name, value: a.id }))}
          />
        }
      >
        <Typography.Paragraph>
          默认鉴权：<Typography.Text code>Authorization: Bearer &lt;API_KEY&gt;</Typography.Text>
          。密钥由业务系统服务端保存；显式设为非鉴权的应用可以省略此请求头。
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: example }}>
          <pre className="api-code">{example}</pre>
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          title="HTTP 202 表示 MsgDock 已持久化受理；平台已接受、发送失败或结果待确认，需通过通知查询或控制台确认。"
        />
      </Card>
      <Card title="查询通知" className="mt20">
        <pre className="api-code">{`GET /api/v1/apps/${app?.key ?? '{app_key}'}/notifications/{notification_id}\nAuthorization: Bearer <API_KEY>`}</pre>
        <p>即使发送采用非鉴权模式，结果查询也始终需要有效的应用 API Key。</p>
      </Card>
      <Card title="模板与主题" className="mt20">
        <pre className="api-code">
          {JSON.stringify(
            {
              event: 'order.paid',
              target: { type: 'topic', key: 'finance' },
              template: { key: 'order_paid' },
              variables: { order_no: '20261020001', amount: '299.00' },
              expires_in: 3600,
            },
            null,
            2,
          )}
        </pre>
        <p className="muted">
          同一个应用内，重复提交相同 Idempotency-Key 与相同请求返回原通知；不同请求返回
          409。主题内每个目标都必须在应用的授权范围内。
        </p>
      </Card>
    </>
  );
}
