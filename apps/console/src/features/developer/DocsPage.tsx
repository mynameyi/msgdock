import { Alert, Button, Card, Steps, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';
export function DocsPage() {
  const example = [
    `curl -X POST '${location.origin}/api/v1/notifications'`,
    "  -H 'Authorization: Bearer <API_KEY>'",
    "  -H 'Content-Type: application/json'",
    `  -d '${JSON.stringify({ target: { type: 'targets', ids: ['ch_a7c92e4f6b18'] }, message: { text: '订单支付成功。' }, expires_in: 3600 }, null, 2)}'`,
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
          items={[{ title: '配置渠道' }, { title: '生成 API Key' }, { title: '发送与查询' }]}
        />
      </Card>
      <Card title="发送通知" className="mt20">
        <Typography.Paragraph>
          默认鉴权：<Typography.Text code>Authorization: Bearer &lt;API_KEY&gt;</Typography.Text>
          。密钥由业务系统服务端保存；在系统设置中关闭鉴权后，发送和查询均可省略此请求头。
        </Typography.Paragraph>
        <p className="muted">
          管理员先在<Link to="/console">管理控制台</Link>
          配置渠道，并在开启鉴权时创建 API Key。渠道列表中的“渠道 ID”支持一键复制，直接填入
          target.ids；例如 ch_a7c92e4f6b18。以下示例需替换 API_KEY 和渠道 ID。
        </p>
        <p className="muted">
          发送目标仅接受渠道短 ID，由系统自动生成，重命名后保持不变。短 ID 不是 API
          Key；开启鉴权时仍需提供有效密钥。
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
      <Card title="可选：避免重复通知" className="mt20">
        <p>普通推送无需填写幂等键，每次请求都会创建新通知。需要安全重试时，在请求 JSON 中增加：</p>
        <pre className="api-code">
          {JSON.stringify({ idempotency_key: 'order-paid-1001' }, null, 2)}
        </pre>
        <p>
          同一次业务通知重试时复用原键。相同键与相同请求返回原通知，相同键与不同内容返回 409。
          不传幂等键时，内容相同的请求也会分别发送。
        </p>
      </Card>
      <Card title="查询通知" className="mt20">
        <pre className="api-code">{`GET /api/v1/notifications/{notification_id}\nAuthorization: Bearer <API_KEY>`}</pre>
        <p>查询与发送使用同一系统级鉴权开关。有效 Key 具有相同的通知查询权限。</p>
      </Card>
      <Card title="模板与主题" className="mt20">
        <pre className="api-code">
          {JSON.stringify(
            {
              target: { type: 'topic', key: 'finance' },
              template: { key: 'order_paid' },
              variables: { order_no: '20261020001', amount: '299.00' },
              expires_in: 3600,
            },
            null,
            2,
          )}
        </pre>
        <p className="muted">主题用于组合多个已启用渠道；模板通知也可按需提供 idempotency_key。</p>
      </Card>
      <Card title="响应与错误处理" className="mt20">
        <p>
          <Link to="/docs/responses">完整响应规范、错误码与升级说明 →</Link>
        </p>
        <p>
          所有业务 API 与管理 API 统一返回 code、message、data、request_id。HTTP
          状态码保留原有语义；参数、鉴权或受理失败时 data 为 null，按稳定的 code 判断原因。
        </p>
        <pre className="api-code">
          {JSON.stringify(
            {
              code: 'OK',
              message: '通知已受理',
              data: {
                notification_id: '<NOTIFICATION_ID>',
                status: 'accepted_for_processing',
                delivery_count: 1,
                idempotency_hit: false,
              },
              request_id: '<REQUEST_ID>',
            },
            null,
            2,
          )}
        </pre>
        <p>
          HTTP 202 与 code=OK 表示持久化受理。HTTP 200 与 code=OK 表示查询成功；实际投递状态在
          data.deliveries 中，每个目标包含 status 与 error。失败投递不会让查询本身变成接口错误。
        </p>
        <pre className="api-code">
          {JSON.stringify(
            {
              code: 'TARGET_UNAVAILABLE',
              message: '目标不存在或渠道已停用',
              data: null,
              request_id: '<REQUEST_ID>',
            },
            null,
            2,
          )}
        </pre>
        <p>
          参数校验失败返回 VALIDATION_ERROR，并在 details 中说明字段。HTTP 409 与
          IDEMPOTENCY_CONFLICT 表示幂等键对应的请求内容发生变化。通信超时可能没有
          JSON；已提供幂等键时复用原键重试，未提供时重试可能重复发送。 投递为 unknown
          时先核实结果，避免直接重发。
        </p>
      </Card>
    </>
  );
}
