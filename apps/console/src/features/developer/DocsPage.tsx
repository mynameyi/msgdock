import { Alert, Button, Card, Steps, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';
export function DocsPage() {
  const example = [
    `curl -X POST '${location.origin}/api/v1/apps/<APP_KEY>/notifications'`,
    "  -H 'Authorization: Bearer <API_KEY>'",
    "  -H 'Content-Type: application/json'",
    "  -H 'Idempotency-Key: <UNIQUE_EVENT_ID>'",
    `  -d '${JSON.stringify({ event: 'order.paid', target: { type: 'targets', ids: ['<TARGET_ID>'] }, message: { text: '订单支付成功。' }, expires_in: 3600 }, null, 2)}'`,
  ].join(' \\\n');
  return (
    <>
      <PageTitle
        title="开发文档"
        description="从第一条通知开始，接入统一 API，或开发自己的渠道插件。"
        actions={
          <Button href="/openapi.json" target="_blank">
            查看 OpenAPI JSON ↗
          </Button>
        }
      />
      <DocsNavigation />
      <div className="docs-entry-grid">
        <Link to="/docs/swagger">
          <b>
            Swagger UI <span>↗</span>
          </b>
          <p>查看请求结构、填写 API Key，在线调试接口。</p>
        </Link>
        <Link to="/docs/redoc">
          <b>
            ReDoc <span>↗</span>
          </b>
          <p>阅读完整接口参考、参数和返回值。</p>
        </Link>
        <Link to="/docs/plugins">
          <b>
            渠道插件开发 <span>↗</span>
          </b>
          <p>了解 SDK、配置 Schema 与插件接入约定。</p>
        </Link>
      </div>
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
      <Card title="发送通知" className="mt20">
        <Typography.Paragraph>
          默认鉴权：<Typography.Text code>Authorization: Bearer &lt;API_KEY&gt;</Typography.Text>
          。密钥由业务系统服务端保存；显式设为非鉴权的应用可以省略此请求头。
        </Typography.Paragraph>
        <p className="muted">
          管理员先在<Link to="/console">管理控制台</Link>
          配置渠道、应用和授权目标。以下均为占位示例，请替换
          APP_KEY、API_KEY、TARGET_ID，并为新事件生成唯一幂等键。
        </p>
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
        <pre className="api-code">{`GET /api/v1/apps/{appKey}/notifications/{notification_id}\nAuthorization: Bearer <API_KEY>`}</pre>
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
