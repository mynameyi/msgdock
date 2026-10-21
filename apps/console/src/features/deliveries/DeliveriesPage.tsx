import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { SendOutlined, SyncOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { getDeliveries, getDelivery, cancelDelivery, replayDelivery, resolveDelivery } from './api';
import { Delivery, statusNames } from '../../shared/api';
import { PageTitle, QueryState, StatusTag } from '../../shared/ui';
import { TestSend } from './TestSend';
export function DeliveriesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const cursor = params.get('cursor') ?? undefined;
  const cache = useQueryClient();
  const { message } = App.useApp();
  const query = useQuery({
    queryKey: ['deliveries', status, cursor],
    queryFn: () => getDeliveries(status, cursor),
    refetchInterval: 5000,
  });
  const [detailId, setDetailId] = useState<string>();
  const detail = useQuery({
    queryKey: ['delivery', detailId],
    queryFn: () => getDelivery(detailId!),
    enabled: !!detailId,
    refetchInterval: detailId ? 5000 : false,
  });
  const [test, setTest] = useState(false);
  const [operation, setOperation] = useState<{ kind: 'replay' | 'resolve'; delivery: Delivery }>();
  const [form] = Form.useForm();
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['deliveries'] });
    await cache.invalidateQueries({ queryKey: ['delivery'] });
    await cache.invalidateQueries({ queryKey: ['overview'] });
  }
  const cancel = useMutation({
    mutationFn: cancelDelivery,
    onSuccess: async () => {
      message.success('投递已取消');
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });
  const act = useMutation({
    mutationFn: (v: { reason: string; confirmed: boolean }) =>
      operation!.kind === 'replay'
        ? replayDelivery(operation!.delivery.id, v.reason, v.confirmed)
        : resolveDelivery(operation!.delivery.id, v.reason),
    onSuccess: async () => {
      message.success(
        operation?.kind === 'replay' ? '已创建关联重发，原始记录保留' : '核实结果已记录',
      );
      setOperation(undefined);
      await refresh();
    },
  });
  function action(kind: 'replay' | 'resolve', delivery: Delivery) {
    act.reset();
    form.resetFields();
    setOperation({ kind, delivery });
  }
  return (
    <>
      <PageTitle
        title="消息投递"
        description="追踪每个目标的投递结果、尝试记录与人工操作。"
        actions={
          <>
            <Button icon={<SyncOutlined />} onClick={() => query.refetch()}>
              刷新
            </Button>
            <Button type="primary" icon={<SendOutlined />} onClick={() => setTest(true)}>
              发送测试
            </Button>
          </>
        }
      />
      <div className="filter-row">
        <Select
          aria-label="投递状态"
          value={status}
          style={{ width: 160 }}
          onChange={(v) => setParams(v ? { status: v } : {})}
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusNames).map(([value, label]) => ({ value, label })),
          ]}
        />
        <span className="small muted">每 5 秒自动更新 · 每页最多 50 条</span>
      </div>
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data?.items ?? []}
            pagination={false}
            scroll={{ x: 950 }}
            columns={[
              {
                title: '调用来源',
                render: (_, d: Delivery) => (
                  <>
                    <b>
                      {d.notification.apiKey?.name ??
                        (d.notification.idempotencyScope === 'console'
                          ? '控制台测试'
                          : '匿名 / 历史通知')}
                    </b>
                    <span className="cell-secondary">
                      {d.notification.apiKey?.prefix ? d.notification.apiKey.prefix + '…' : ''}
                    </span>
                  </>
                ),
              },
              { title: '接收目标', dataIndex: 'targetName' },
              { title: '状态', dataIndex: 'status', render: (v) => <StatusTag status={v} /> },
              { title: '尝试', dataIndex: 'attemptCount' },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                render: (v) => dayjs(v).format('MM-DD HH:mm:ss'),
              },
              {
                title: '操作',
                render: (_, d: Delivery) => (
                  <Space size={2}>
                    <Button type="link" onClick={() => setDetailId(d.id)}>
                      详情
                    </Button>
                    {['pending', 'retry_wait'].includes(d.status) && (
                      <Popconfirm
                        title="取消这条待执行投递？"
                        onConfirm={() => cancel.mutate(d.id)}
                        okText="取消投递"
                        cancelText="返回"
                      >
                        <Button type="link" danger>
                          取消
                        </Button>
                      </Popconfirm>
                    )}
                    {['failed', 'expired', 'unknown', 'cancelled'].includes(d.status) && (
                      <Button type="link" onClick={() => action('replay', d)}>
                        关联重发
                      </Button>
                    )}
                    {d.status === 'unknown' && (
                      <Button type="link" onClick={() => action('resolve', d)}>
                        核实接受
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
            locale={{ emptyText: '暂无符合条件的投递' }}
          />
          <div className="pagination-bar">
            <Button disabled={!cursor} onClick={() => setParams(status ? { status } : {})}>
              返回第一页
            </Button>
            <Button
              disabled={!query.data?.nextCursor}
              onClick={() =>
                setParams({ ...Object.fromEntries(params), cursor: query.data!.nextCursor! })
              }
            >
              下一页
            </Button>
          </div>
        </Card>
      </QueryState>
      <Drawer
        title="投递详情"
        open={!!detailId}
        onClose={() => setDetailId(undefined)}
        size="large"
      >
        <QueryState loading={detail.isLoading} error={detail.error} retry={detail.refetch}>
          {detail.data && (
            <>
              <Descriptions
                column={1}
                size="small"
                bordered
                items={[
                  {
                    key: 'id',
                    label: 'Delivery ID',
                    children: <Typography.Text copyable>{detail.data.id}</Typography.Text>,
                  },
                  {
                    key: 'status',
                    label: '状态',
                    children: <StatusTag status={detail.data.status} />,
                  },
                  { key: 'target', label: '目标', children: detail.data.targetName },
                  {
                    key: 'plugin',
                    label: '执行插件',
                    children: `${detail.data.pluginId}@${detail.data.pluginVersion}`,
                  },
                  {
                    key: 'config-version',
                    label: '配置结构版本',
                    children: detail.data.configVersion,
                  },
                  { key: 'error', label: '处理结果', children: detail.data.error?.message ?? '—' },
                  { key: 'code', label: '结果代码', children: detail.data.error?.code ?? '—' },
                  {
                    key: 'source',
                    label: '插件原始代码',
                    children: detail.data.error?.source_code ?? '—',
                  },
                  {
                    key: 'replay',
                    label: '关联重发来源',
                    children: detail.data.replayOfDeliveryId ?? '无',
                  },
                ]}
              />
              <h3>消息快照</h3>
              <pre className="api-code">{detail.data.text}</pre>
              {detail.data.status === 'unknown' && (
                <Alert
                  type="warning"
                  showIcon
                  title="此消息可能已被平台接受。请在平台核实后记录结果，或确认重复风险后创建关联重发。"
                />
              )}
              <h3>发送尝试</h3>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={detail.data.attempts}
                columns={[
                  { title: '次数', dataIndex: 'number' },
                  { title: '结果', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
                  { title: '代码', dataIndex: 'code' },
                  {
                    title: '开始时间',
                    dataIndex: 'startedAt',
                    render: (v) => dayjs(v).format('HH:mm:ss'),
                  },
                ]}
                locale={{ emptyText: '尚未发起实际发送' }}
              />
            </>
          )}
        </QueryState>
      </Drawer>
      <Modal
        title={operation?.kind === 'replay' ? '创建关联重发' : '确认平台已接受'}
        open={!!operation}
        onCancel={() => setOperation(undefined)}
        onOk={() => form.submit()}
        confirmLoading={act.isPending}
        okText={operation?.kind === 'replay' ? '创建新投递' : '记录核实结果'}
        cancelText="取消"
        destroyOnHidden
      >
        {operation?.delivery.status === 'unknown' && (
          <Alert
            type="warning"
            className="mb16"
            showIcon
            title="原请求可能已经发送成功，重发可能产生重复消息。原始投递记录会保留。"
          />
        )}
        {act.error && <Alert type="error" className="mb16" title={act.error.message} />}
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => act.mutate({ ...v, confirmed: !!v.confirmed })}
        >
          <Form.Item
            name="reason"
            label={operation?.kind === 'replay' ? '重发原因' : '核实依据'}
            rules={[{ required: true }, { min: 3, message: '请至少填写 3 个字符' }]}
          >
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
          {operation?.kind === 'replay' && operation.delivery.status === 'unknown' && (
            <Form.Item
              name="confirmed"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, v) =>
                    v ? Promise.resolve() : Promise.reject(new Error('请明确确认重复风险')),
                },
              ]}
            >
              <Checkbox>我已核实情况并确认承担重复发送的风险</Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
      <TestSend open={test} onClose={() => setTest(false)} />
    </>
  );
}
