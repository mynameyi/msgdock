import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { createKey, getApiKeys, revokeKey, updateKey } from './api';
import { getApiSettings } from '../system/api';
import { ApiKeyRecord } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';

export function ApiKeysPage() {
  const query = useQuery({ queryKey: ['api-keys'], queryFn: getApiKeys });
  const settings = useQuery({ queryKey: ['api-settings'], queryFn: getApiSettings });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<ApiKeyRecord | null | undefined>();
  const [rawKey, setRawKey] = useState<string>();
  const [form] = Form.useForm<{ name: string; enabled: boolean }>();
  const save = useMutation({
    mutationFn: (input: { name: string; enabled: boolean }) =>
      editing ? updateKey(editing.id, input) : createKey(input),
    onSuccess: async (data) => {
      setEditing(undefined);
      if ('key' in data) setRawKey(data.key as string);
      await cache.invalidateQueries({ queryKey: ['api-keys'] });
      message.success(editing ? 'API Key 已更新' : 'API Key 已生成');
    },
  });
  const revoke = useMutation({
    mutationFn: revokeKey,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['api-keys'] });
      message.success('API Key 已撤销');
    },
    onError: (e) => message.error(e.message),
  });
  function edit(record: ApiKeyRecord | null) {
    save.reset();
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(
      record ? { name: record.name, enabled: record.enabled } : { name: '', enabled: true },
    );
  }
  return (
    <>
      <PageTitle
        title="API Key"
        description="创建和管理访问通知接口的密钥，无需创建接入应用。"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
            创建 API Key
          </Button>
        }
      />
      <Alert
        className="mb16"
        type={settings.data?.authEnabled === false ? 'warning' : 'info'}
        showIcon
        title={
          settings.data?.authEnabled === false
            ? '系统鉴权已关闭，不带 Key 也可发送和查询通知。'
            : '系统鉴权默认开启，通过 Authorization: Bearer <API_KEY> 调用通知接口。'
        }
        description={
          <span>
            各 Key 具有相同的通知接口权限，可按用途分别创建，便于停用与撤销。鉴权开关位于{' '}
            <Link to="/console/settings">系统设置</Link>。
          </span>
        }
      />
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data}
            pagination={false}
            scroll={{ x: 1100 }}
            columns={[
              { title: '名称', dataIndex: 'name' },
              {
                title: 'API Key',
                width: 450,
                render: (_, record: ApiKeyRecord) =>
                  record.key ? (
                    <Typography.Text
                      code
                      copyable={{ text: record.key }}
                      style={{ wordBreak: 'break-all' }}
                    >
                      {record.key}
                    </Typography.Text>
                  ) : (
                    <div>
                      <Typography.Text code>{record.prefix}…</Typography.Text>
                      <span className="cell-secondary">
                        旧 Key 仅存摘要，无法还原；新建 Key 后可查看完整值。
                      </span>
                    </div>
                  ),
              },
              {
                title: '状态',
                render: (_, k: ApiKeyRecord) => (
                  <Tag color={k.revokedAt ? 'default' : k.enabled ? 'green' : 'gold'}>
                    {k.revokedAt ? '已撤销' : k.enabled ? '已启用' : '已停用'}
                  </Tag>
                ),
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
              },
              {
                title: '操作',
                render: (_, k: ApiKeyRecord) =>
                  !k.revokedAt && (
                    <Space>
                      <Button type="link" onClick={() => edit(k)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="撤销后此 Key 将永久失效"
                        okText="撤销"
                        cancelText="取消"
                        onConfirm={() => revoke.mutate(k.id)}
                      >
                        <Button
                          type="link"
                          danger
                          loading={revoke.isPending && revoke.variables === k.id}
                        >
                          撤销
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
              },
            ]}
            locale={{ emptyText: '暂无 API Key，创建后即可调用通知接口' }}
          />
        </Card>
      </QueryState>
      <Modal
        title={editing ? '编辑 API Key' : '创建 API Key'}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText={editing ? '保存' : '生成 Key'}
        cancelText="取消"
        destroyOnHidden
      >
        {save.error && <Alert className="mb16" type="error" title={save.error.message} />}
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, whitespace: true, message: '请填写便于识别用途的名称' }]}
          >
            <Input maxLength={80} placeholder="例如：订单通知、监控告警" />
          </Form.Item>
          <Form.Item name="enabled" label="启用 Key" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={
          <>
            <KeyOutlined /> API Key 已生成
          </>
        }
        open={!!rawKey}
        onCancel={() => {
          setRawKey(undefined);
          save.reset();
        }}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setRawKey(undefined);
              save.reset();
            }}
          >
            关闭
          </Button>
        }
        destroyOnHidden
      >
        <Alert
          className="mb16"
          type="info"
          showIcon
          title="完整密钥已保存，之后也可以在 API Key 列表中查看和复制。"
        />
        <Typography.Paragraph code copyable={{ text: rawKey }}>
          {rawKey}
        </Typography.Paragraph>
        <pre className="api-code">Authorization: Bearer &lt;API_KEY&gt;</pre>
      </Modal>
    </>
  );
}
