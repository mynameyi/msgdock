import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Segmented, Select, Space, Table, Tag } from 'antd';
import {
  ArrowRightOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { getOverview } from './api';
import { getApplications } from '../applications/api';
import { TestSend } from '../deliveries/TestSend';
import { PageTitle, QueryState, StatusTag, number } from '../../shared/ui';
import { Delivery } from '../../shared/api';
import { getChannelPlugins } from '../channels/api';
export function OverviewPage() {
  const query = useQuery({ queryKey: ['overview'], queryFn: getOverview, refetchInterval: 10000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: getApplications });
  const plugins = useQuery({ queryKey: ['channel-plugins'], queryFn: getChannelPlugins });
  const channelNames = Object.fromEntries((plugins.data ?? []).map((p) => [p.id, p.name]));
  const [range, setRange] = useState('今日');
  const [test, setTest] = useState(false);
  const [selected, setSelected] = useState<string>();
  const navigate = useNavigate();
  const data = query.data;
  const app = apps.data?.find((a) => a.id === selected) ?? apps.data?.[0];
  const counts = data?.counts ?? {};
  const pending = data?.pendingCount ?? 0;
  const attention = (counts.failed ?? 0) + (data?.unknownCount ?? 0);
  const accepted = counts.accepted ?? 0;
  const chart =
    range === '今日'
      ? (data?.hours ?? []).map((p) => ({ label: dayjs(p.time).format('HH:mm'), count: p.count }))
      : (data?.days ?? []).map((p) => ({ label: dayjs(p.time).format('MM/DD'), count: p.count }));
  const columns = [
    {
      title: '通知 / 应用',
      key: 'event',
      render: (_: unknown, d: Delivery) => (
        <div>
          <b>{d.notification.event}</b>
          <span className="cell-secondary">{d.notification.application.name}</span>
        </div>
      ),
    },
    { title: '接收目标', dataIndex: 'targetName', responsive: ['lg' as const] },
    { title: '投递状态', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { title: '时间', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('HH:mm:ss') },
  ];
  return (
    <>
      <PageTitle
        title="概览"
        description="掌握每一条消息的去向。"
        actions={
          <>
            <span className="date-pill">
              <CalendarOutlined /> {dayjs().format('YYYY / MM / DD')}
            </span>
            <Button type="primary" icon={<SendOutlined />} onClick={() => setTest(true)}>
              发送测试
            </Button>
          </>
        }
      />
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <div className="stats-grid">
          <Card size="small">
            <div className="stat-label">
              <SendOutlined />
              今日投递
            </div>
            <div className="stat-value">{number(data?.total ?? 0)}</div>
            <div className="stat-note">
              {data?.previous ? (
                <>
                  <span className="positive">
                    <ArrowUpOutlined />{' '}
                    {(((data.total - data.previous) / data.previous) * 100).toFixed(1)}%
                  </span>{' '}
                  较昨日同期
                </>
              ) : data?.total ? (
                '暂无昨日同期数据'
              ) : (
                '等待第一条消息'
              )}
            </div>
          </Card>
          <Card size="small">
            <div className="stat-label">
              <CheckCircleOutlined />
              平台接受率
            </div>
            <div className="stat-value">
              {data?.total ? ((accepted / data.total) * 100).toFixed(1) : '—'}
              <small>{data?.total ? '%' : ''}</small>
            </div>
            <div className="stat-note">{number(accepted)} 条已被平台接受</div>
          </Card>
          <Card size="small">
            <div className="stat-label">
              <ClockCircleOutlined />
              处理中
            </div>
            <div className="stat-value">{number(pending)}</div>
            <div className="stat-note">
              {pending ? `最早等待 ${data?.oldestWaitingSeconds ?? 0} 秒` : '当前没有积压'}
            </div>
          </Card>
          <Card size="small">
            <div className="stat-label">
              <ExclamationCircleOutlined />
              需要关注
            </div>
            <div className="stat-value warning-value">{number(attention)}</div>
            <div className="stat-note">
              今日 {counts.failed ?? 0} 条失败 · {data?.unknownCount ?? 0} 条待确认
            </div>
          </Card>
        </div>
        {!!data?.unknownCount && (
          <Alert
            type="warning"
            showIcon
            title={`${data.unknownCount} 条投递结果待确认`}
            description="平台响应不明，请先核实后再决定是否重发。"
            action={
              <Button type="link" onClick={() => navigate('/deliveries?status=unknown')}>
                查看待确认 <ArrowRightOutlined />
              </Button>
            }
          />
        )}
        {!data?.channels.length && (
          <Alert
            type="info"
            showIcon
            title="欢迎使用信港"
            description="添加渠道 → 创建接入应用并授权目标 → 生成 API Key → 发送第一条通知。"
            action={<Button onClick={() => navigate('/channels')}>添加渠道</Button>}
          />
        )}
        <div className="dashboard-grid">
          <Card
            title="投递趋势"
            extra={
              <Segmented
                options={['今日', '近 7 天']}
                value={range}
                onChange={(v) => setRange(String(v))}
              />
            }
          >
            <div className="chart-caption">
              {range === '今日' ? '今日各时段投递量' : '最近七日每日投递量'} · 条
            </div>
            <div className="trend-chart">
              {chart.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chart} margin={{ top: 16, right: 12, bottom: 4, left: -14 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#e9edf3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={28}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip labelFormatter={(v) => String(v)} formatter={(v) => [v, '投递量']} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#3569ef"
                      fill="#edf3ff"
                      strokeWidth={2.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚无投递数据，发送通知后自动生成趋势"
                />
              )}
            </div>
          </Card>
          <Card title="渠道状态" extra={<Link to="/channels">管理 ↗</Link>}>
            <div className="channel-list">
              {data?.channels.length ? (
                data.channels.slice(0, 4).map((c) => (
                  <div className="channel-row" key={c.id}>
                    <span className={`channel-icon ${c.type.split('.')[0]}`}>
                      {(channelNames[c.type] ?? '测')[0]}
                    </span>
                    <div>
                      <b>{c.name}</b>
                      <span className="cell-secondary">{channelNames[c.type] ?? c.type}</span>
                    </div>
                    <Badge
                      status={
                        !c.enabled
                          ? 'default'
                          : c.lastStatus === 'healthy'
                            ? 'success'
                            : c.lastStatus === 'untested'
                              ? 'default'
                              : 'warning'
                      }
                      text={
                        !c.enabled
                          ? '已停用'
                          : c.lastStatus === 'healthy'
                            ? '最近正常'
                            : c.lastStatus === 'untested'
                              ? '未测试'
                              : '需关注'
                      }
                    />
                  </div>
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有配置渠道" />
              )}
            </div>
            <div className="panel-footer">
              <span>{data?.channels.filter((c) => c.enabled).length ?? 0} 个渠道已启用</span>
              <Link to="/channels">
                <PlusOutlined /> 添加渠道
              </Link>
            </div>
          </Card>
        </div>
        <div className="dashboard-grid">
          <Card
            title="最近投递"
            extra={
              <Link to="/deliveries">
                查看全部 <ArrowRightOutlined />
              </Link>
            }
            className="table-card"
          >
            <Table
              rowKey="id"
              size="small"
              dataSource={data?.recent ?? []}
              columns={columns}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无投递记录" />
                ),
              }}
            />
          </Card>
          <Card
            title="API 接入"
            extra={
              app ? (
                <Tag color={app.authMode === 'none' ? 'gold' : 'green'}>
                  {app.authMode === 'none' ? '非鉴权模式' : '鉴权已开启'}
                </Tag>
              ) : null
            }
          >
            <div className="api-select">
              <span>接入应用</span>
              <Select
                value={app?.id}
                placeholder="请先创建应用"
                onChange={setSelected}
                options={apps.data?.map((a) => ({ label: a.name, value: a.id }))}
                variant="borderless"
              />
            </div>
            <pre className="api-code">{`POST /api/v1/apps/${app?.key ?? '{app_key}'}/notifications\n${app?.authMode === 'none' ? '' : 'Authorization: Bearer <API_KEY>\n'}Content-Type: application/json\nIdempotency-Key: <UNIQUE_KEY>\n\n{ "event": "order.paid", ... }`}</pre>
            <p className="small muted">
              {app?.authMode === 'none'
                ? '该应用已显式关闭发送鉴权。查询与后台管理仍需认证。'
                : '新建应用默认使用 API Key 鉴权；密钥由业务服务端持有。'}
            </p>
            <div className="panel-footer">
              <Link to="/applications">管理接入应用 ↗</Link>
              <Link to="/docs">
                接口文档 <ArrowRightOutlined />
              </Link>
            </div>
          </Card>
        </div>
        <div className="home-footer">
          <Space>
            <Badge status="processing" />每 10 秒更新一次
          </Space>
          <span>MsgDock 信港 · 一次接入，消息通达。</span>
        </div>
      </QueryState>
      <TestSend open={test} onClose={() => setTest(false)} />
    </>
  );
}
