import { useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Switch,
  Modal,
  Table,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  getSystem,
  getAudit,
  changePassword,
  getApiSettings,
  saveApiSettings,
  ApiSettings,
} from './api';
import { PageTitle, QueryState } from '../../shared/ui';
export function SystemPage() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const password = useMutation({
    mutationFn: changePassword,
    onSuccess: async () => {
      setPasswordOpen(false);
      form.resetFields();
      message.success('密码已修改，其他会话已退出');
      await cache.invalidateQueries({ queryKey: ['audit'] });
    },
  });
  const system = useQuery({ queryKey: ['system'], queryFn: getSystem, refetchInterval: 10000 });
  const audit = useQuery({ queryKey: ['audit'], queryFn: getAudit });
  return (
    <>
      <PageTitle
        title="系统设置"
        description="查看实例运行状态、部署信息和操作审计。"
        actions={
          <Button
            onClick={() => {
              password.reset();
              setPasswordOpen(true);
            }}
          >
            修改密码
          </Button>
        }
      />
      <Modal
        title="修改管理员密码"
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={password.isPending}
        okText="修改密码"
        cancelText="取消"
        destroyOnHidden
      >
        {password.error && <Alert type="error" title={password.error.message} className="mb16" />}
        <Form form={form} layout="vertical" onFinish={(v) => password.mutate(v)}>
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true }, { min: 12, message: '密码至少 12 位' }]}
          >
            <Input.Password autoComplete="new-password" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>
      <ApiAccessSettings />
      <QueryState loading={system.isLoading} error={system.error} retry={system.refetch}>
        <Card title="实例信息">
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 'version', label: '版本', children: `v${system.data?.version}` },
              { key: 'deployment', label: '部署方式', children: '单镜像 · 单容器' },
              { key: 'db', label: '数据库', children: system.data?.database },
              { key: 'queue', label: '队列', children: system.data?.queue },
              {
                key: 'worker',
                label: 'Worker',
                children: (
                  <Badge
                    status={system.data?.workerReady ? 'success' : 'error'}
                    text={system.data?.workerReady ? '运行正常' : '心跳异常'}
                  />
                ),
              },
              {
                key: 'redis',
                label: 'Redis',
                children: (
                  <Badge
                    status={system.data?.redisReady ? 'success' : 'error'}
                    text={system.data?.redisReady ? '已连接' : '不可用'}
                  />
                ),
              },
              {
                key: 'volume',
                label: '持久化目录',
                children: <Typography.Text code>/data</Typography.Text>,
              },
              {
                key: 'key',
                label: 'API Key 请求头',
                children: (
                  <Typography.Text code>Authorization: Bearer &lt;API_KEY&gt;</Typography.Text>
                ),
              },
            ]}
          />
        </Card>
        {system.data?.testMode && (
          <Alert
            type="warning"
            className="mt16"
            showIcon
            title="此实例启用了集成测试模式，请勿用于真实业务。"
          />
        )}
      </QueryState>
      <Card title="最近操作审计" className="mt20 table-card">
        <Table
          rowKey="id"
          size="small"
          dataSource={audit.data ?? []}
          loading={audit.isLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 700 }}
          columns={[
            {
              title: '操作时间',
              dataIndex: 'createdAt',
              render: (v) => dayjs(v).format('MM-DD HH:mm:ss'),
            },
            { title: '操作者', dataIndex: 'actor' },
            { title: '操作', dataIndex: 'action' },
            {
              title: '资源',
              dataIndex: 'resource',
              render: (v) => (
                <Typography.Text copyable ellipsis style={{ maxWidth: 220 }}>
                  {v}
                </Typography.Text>
              ),
            },
          ]}
          locale={{ emptyText: audit.error ? audit.error.message : '暂无操作记录' }}
        />
      </Card>
    </>
  );
}

function ApiAccessSettings() {
  const query = useQuery({ queryKey: ['api-settings'], queryFn: getApiSettings });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const save = useMutation({
    mutationFn: saveApiSettings,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['api-settings'] });
      message.success('API 鉴权设置已保存');
    },
  });
  return (
    <Card title="通知 API 鉴权" className="mb16">
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        {query.data && (
          <Form<ApiSettings>
            key={JSON.stringify(query.data)}
            layout="vertical"
            initialValues={query.data}
            onFinish={(v) => save.mutate(v)}
          >
            <Form.Item
              name="authEnabled"
              label="开启 API Key 鉴权"
              valuePropName="checked"
              extra="默认开启：发送和查询需要 Authorization: Bearer <API_KEY>。关闭后不提供 Key 也可调用通知接口。此开关不影响管理员登录。"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="perMinuteLimit"
              label="实例每分钟发送请求上限"
              extra="所有 Key 和匿名请求共用此额度；渠道插件仍遵守各平台的发送频率限制。"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={10000} />
            </Form.Item>
            {save.error && <Alert className="mb16" type="error" title={save.error.message} />}
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              保存 API 设置
            </Button>
          </Form>
        )}
      </QueryState>
    </Card>
  );
}
