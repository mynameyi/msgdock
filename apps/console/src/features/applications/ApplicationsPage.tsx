import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { getApplications, saveApplication, createKey, revokeKey } from './api';
import { getTargets } from '../channels/api';
import { AppRecord } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';
export function ApplicationsPage() {
  const query = useQuery({ queryKey: ['applications'], queryFn: getApplications });
  const targets = useQuery({ queryKey: ['targets'], queryFn: getTargets });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<AppRecord | null | undefined>();
  const [keysId, setKeysId] = useState<string>();
  const [rawKey, setRawKey] = useState<string>();
  const [form] = Form.useForm();
  const authMode = Form.useWatch('authMode', form);
  const save = useMutation({
    mutationFn: (v: any) => saveApplication(v, editing?.id),
    onSuccess: async () => {
      setEditing(undefined);
      await cache.invalidateQueries({ queryKey: ['applications'] });
      message.success('应用已保存');
    },
  });
  const key = useMutation({
    mutationFn: createKey,
    onSuccess: async (data) => {
      setRawKey(data.key);
      await cache.invalidateQueries({ queryKey: ['applications'] });
    },
  });
  const revoke = useMutation({
    mutationFn: ({ id, keyId }: { id: string; keyId: string }) => revokeKey(id, keyId),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['applications'] });
      message.success('密钥已撤销');
    },
    onError: (e) => message.error(e.message),
  });
  function edit(record: AppRecord | null) {
    save.reset();
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(
      record ?? { authMode: 'api_key', enabled: true, perMinuteLimit: 60, allowedTargetIds: [] },
    );
  }
  const keyApp = query.data?.find((a) => a.id === keysId);
  return (
    <>
      <PageTitle
        title="接入应用"
        description="为业务系统分配 API Key 和可发送的目标范围。"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
            创建应用
          </Button>
        }
      />
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data}
            pagination={false}
            scroll={{ x: 780 }}
            columns={[
              {
                title: '应用',
                render: (_, a: AppRecord) => (
                  <>
                    <b>{a.name}</b>
                    <span className="cell-secondary">{a.key}</span>
                  </>
                ),
              },
              {
                title: '发送鉴权',
                render: (_, a: AppRecord) => (
                  <Tag color={a.authMode === 'none' ? 'gold' : 'green'}>
                    {a.authMode === 'none' ? '非鉴权' : 'API Key'}
                  </Tag>
                ),
              },
              { title: '授权目标', render: (_, a: AppRecord) => `${a.allowedTargetIds.length} 个` },
              { title: '每分钟请求', dataIndex: 'perMinuteLimit' },
              {
                title: '状态',
                render: (_, a: AppRecord) => (
                  <Tag color={a.enabled ? 'blue' : 'default'}>
                    {a.enabled ? '已启用' : '已停用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                render: (_, a: AppRecord) => (
                  <Space>
                    <Button type="link" onClick={() => edit(a)}>
                      编辑
                    </Button>
                    <Button type="link" icon={<KeyOutlined />} onClick={() => setKeysId(a.id)}>
                      密钥
                    </Button>
                  </Space>
                ),
              },
            ]}
            locale={{ emptyText: '尚无接入应用，创建应用后生成 API Key' }}
          />
        </Card>
      </QueryState>
      <Modal
        title={editing ? '编辑应用' : '创建应用'}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {save.error && <Alert type="error" title={save.error.message} className="mb16" />}
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="应用名称" rules={[{ required: true }]}>
            <Input maxLength={80} placeholder="订单服务" />
          </Form.Item>
          <Form.Item
            name="key"
            label="应用标识"
            rules={[
              { required: true },
              {
                pattern: /^[a-z][a-z0-9-]{2,49}$/,
                message: '3–50 位小写字母、数字、短横线，字母开头',
              },
            ]}
          >
            <Input placeholder="order-service" />
          </Form.Item>
          <Form.Item name="authMode" label="发送接口鉴权" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'API Key 鉴权（默认）', value: 'api_key' },
                { label: '非鉴权发送', value: 'none' },
              ]}
            />
          </Form.Item>
          {authMode === 'none' && (
            <Alert
              className="mb16"
              type="warning"
              showIcon
              title="任何能访问发送接口的调用方都可向此应用的授权目标发送消息。后台管理和结果查询仍需认证。"
            />
          )}
          <Form.Item
            name="allowedTargetIds"
            label="授权目标"
            rules={[{ required: true, type: 'array', min: 1, message: '请至少授权一个目标' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择已配置的目标"
              options={targets.data?.map((t) => ({
                value: t.id,
                label: `${t.name} · ${t.channel.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="perMinuteLimit" label="每分钟请求上限">
            <InputNumber min={1} max={10000} />
          </Form.Item>
          <Form.Item name="enabled" label="启用应用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`${keyApp?.name ?? ''} · API Key`}
        open={!!keysId}
        onCancel={() => setKeysId(undefined)}
        footer={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={key.isPending}
            onClick={() => keysId && key.mutate(keysId)}
          >
            生成新密钥
          </Button>
        }
      >
        <p className="muted">可先创建新密钥、更新业务系统，再撤销旧密钥，实现重叠轮换。</p>
        {key.error && <Alert type="error" title={key.error.message} />}
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={keyApp?.keys ?? []}
          columns={[
            {
              title: '密钥前缀',
              dataIndex: 'prefix',
              render: (v) => <Typography.Text code>{v}…</Typography.Text>,
            },
            {
              title: '操作',
              render: (_, k: { id: string }) => (
                <Popconfirm
                  title="撤销后使用此密钥的请求会立即被拒绝"
                  onConfirm={() => keysId && revoke.mutate({ id: keysId, keyId: k.id })}
                  okText="撤销"
                  cancelText="取消"
                >
                  <Button type="link" danger>
                    撤销
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
          locale={{ emptyText: '暂无有效密钥' }}
        />
      </Modal>
      <Modal
        title="API Key 已生成"
        open={!!rawKey}
        onCancel={() => {
          setRawKey(undefined);
          key.reset();
        }}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setRawKey(undefined);
              key.reset();
            }}
          >
            我已保存
          </Button>
        }
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          title="完整密钥仅显示这一次，请保存到业务服务端的安全配置中。"
          className="mb16"
        />
        <Typography.Paragraph copyable={{ text: rawKey }} code>
          {rawKey}
        </Typography.Paragraph>
        <pre className="api-code">Authorization: Bearer &lt;API_KEY&gt;</pre>
      </Modal>
    </>
  );
}
