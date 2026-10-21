import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CloudServerOutlined,
  CodeOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Typography } from 'antd';
import { Link } from 'react-router-dom';

const channels = [
  { mark: '企', name: '企业微信', detail: '群 Webhook 机器人', style: 'wecom' },
  { mark: '飞', name: '飞书', detail: '自定义群机器人', style: 'feishu' },
  { mark: '钉', name: '钉钉', detail: '企业机器人群消息', style: 'dingtalk' },
];
const features = [
  {
    icon: <ApiOutlined />,
    title: '一个接口，连接多个渠道',
    detail: '统一提交目标与消息内容。通过主题路由，一次通知触达多个接收目标。',
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: '每次投递，都有迹可循',
    detail: '通知持久化受理，支持幂等、限流和受控重试。在控制台查看投递状态与失败原因。',
  },
  {
    icon: <CodeOutlined />,
    title: '以插件扩展你的消息渠道',
    detail: '每种接入方式独立成包，使用统一 SDK 和配置 Schema，随镜像构建与注册。',
  },
  {
    icon: <CloudServerOutlined />,
    title: '一个镜像，部署在自己手中',
    detail: 'API、控制台、Worker 与数据服务集成在同一容器。挂载持久化卷，即可开始配置。',
  },
];
export function LandingPage() {
  const snippet = [
    `curl -X POST '${location.origin}/api/v1/apps/<APP_KEY>/notifications'`,
    "  -H 'Authorization: Bearer <API_KEY>'",
    "  -H 'Content-Type: application/json'",
    `  -d '${JSON.stringify({ idempotency_key: '<UNIQUE_EVENT_ID>', target: { type: 'topic', key: 'finance' }, message: { text: '订单支付成功。' } }, null, 2)}'`,
  ].join(' \\\n');
  return (
    <>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span /> 开源 · 自托管 · 多渠道通知
          </span>
          <h1>
            让业务消息，
            <br />
            <em>抵达每一个渠道。</em>
          </h1>
          <p>
            MsgDock 信港，为你的 Web
            系统提供统一的消息推送入口。连接企业微信、飞书与钉钉，把渠道适配和投递追踪交给信港。
          </p>
          <div className="hero-actions">
            <Link className="public-button primary" to="/docs">
              开始接入 <ArrowRightOutlined />
            </Link>
            <Link className="public-button secondary" to="/console">
              打开管理控制台
            </Link>
          </div>
          <div className="hero-notes">
            <span>
              <CheckOutlined /> 默认 API Key 鉴权
            </span>
            <span>
              <CheckOutlined /> 单 Docker 镜像部署
            </span>
          </div>
        </div>
        <div
          className="message-flow"
          aria-label="业务系统通过 MsgDock 将通知投递到企业微信、飞书和钉钉"
        >
          <div className="flow-topline">
            <span className="flow-dot" /> 消息流转示意 <span>UNIFIED NOTIFICATIONS</span>
          </div>
          <div className="flow-source">
            <CodeOutlined />
            <div>
              <b>你的业务系统</b>
              <small>订单 · 告警 · 任务通知</small>
            </div>
            <code>POST /notifications</code>
          </div>
          <div className="flow-connector">↓</div>
          <div className="flow-hub">
            <span className="brand-mark">M</span>
            <div>
              <b>
                MsgDock <span>信港</span>
              </b>
              <small>统一接入 · 主题路由 · 投递追踪</small>
            </div>
            <span className="flow-hub-label">消息引擎</span>
          </div>
          <div className="flow-connector">↓</div>
          <div className="flow-channels">
            {channels.map((c) => (
              <div key={c.style}>
                <span className={`platform-mark ${c.style}`}>{c.mark}</span>
                <b>{c.name}</b>
                <small>渠道插件</small>
              </div>
            ))}
          </div>
          <div className="flow-notice">
            <CheckOutlined /> 从消息受理到投递结果，统一管理。
          </div>
        </div>
      </section>
      <section className="landing-platforms" aria-labelledby="platforms-title">
        <div>
          <span className="section-kicker">连接团队所在的平台</span>
          <h2 id="platforms-title">首批内置渠道，开箱配置</h2>
        </div>
        <div className="platform-list">
          {channels.map((c) => (
            <div key={c.style}>
              <span className={`platform-mark ${c.style}`}>{c.mark}</span>
              <div>
                <b>{c.name}</b>
                <small>{c.detail}</small>
              </div>
            </div>
          ))}
        </div>
        <p>当前支持文本通知；微信及更多机器人接入方式将通过后续插件扩展。</p>
      </section>
      <section className="landing-features" aria-labelledby="features-title">
        <div className="section-heading">
          <span className="section-kicker">为业务通知准备</span>
          <h2 id="features-title">聚焦业务，让消息流转更简单</h2>
          <p>从接入、发送到追踪，在一个地方完成。</p>
        </div>
        <div className="feature-grid">
          {features.map((f) => (
            <article key={f.title}>
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-code" aria-labelledby="code-title">
        <div>
          <span className="section-kicker">开发者友好</span>
          <h2 id="code-title">从一条 HTTP 请求开始</h2>
          <p>
            配置渠道和应用后，使用 API Key 从业务服务端发送通知。现有系统无需引入各个平台的 SDK。
          </p>
          <ul>
            <li>
              <CheckOutlined /> Swagger UI 在线调试
            </li>
            <li>
              <CheckOutlined /> ReDoc 接口参考
            </li>
            <li>
              <CheckOutlined /> 独立的渠道插件开发指南
            </li>
          </ul>
          <Link to="/docs">
            查看接入文档 <ArrowRightOutlined />
          </Link>
        </div>
        <div className="landing-code-panel">
          <div>
            <span>发送第一条通知</span>
            <Typography.Text copyable={{ text: snippet }}>复制 cURL</Typography.Text>
          </div>
          <pre>{snippet}</pre>
          <p>HTTP 202 表示已受理；实际投递结果通过查询接口或控制台确认。</p>
        </div>
      </section>
      <section className="landing-cta">
        <div>
          <span className="section-kicker">你的消息，你的基础设施</span>
          <h2>把信港接入下一个业务系统。</h2>
          <p>阅读开发文档，或进入控制台配置你的第一条渠道。</p>
        </div>
        <div className="hero-actions">
          <Link className="public-button primary" to="/docs">
            阅读开发文档 <ArrowRightOutlined />
          </Link>
          <a
            className="public-button secondary"
            href="https://github.com/mynameyi/msgdock"
            target="_blank"
            rel="noreferrer"
          >
            在 GitHub 上查看 ↗
          </a>
        </div>
      </section>
    </>
  );
}
