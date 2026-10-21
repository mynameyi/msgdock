import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ApiOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { getChannelPlugins, getChannels, saveChannel } from './api';
import { Channel } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';
import { TestSend } from '../deliveries/TestSend';
import { PluginFields } from './PluginFields';
import { Link } from 'react-router-dom';

export function ChannelsPage() {
  const query = useQuery({ queryKey: ['channels'], queryFn: getChannels });
  const plugins = useQuery({ queryKey: ['channel-plugins'], queryFn: getChannelPlugins });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Channel | null | undefined>();
  const [test, setTest] = useState(false);
  const [form] = Form.useForm();
  const selected = Form.useWatch('plugin', form);
  const plugin = plugins.data?.find((p) => `${p.id}@${p.version}` === selected);
  const save = useMutation({
    mutationFn: (v: any) => {
      if (!plugin) throw new Error('插件版本不可用，请检查插件目录');
      return saveChannel(
        {
          name: v.name,
          type: plugin.id,
          pluginVersion: plugin.version,
          credentials: v.credentials ?? {},
          targetConfig: v.targetConfig ?? {},
          enabled: v.enabled,
        },
        editing?.id,
      );
    },
    onSuccess: async () => {
      setEditing(undefined);
      await Promise.all(
        ['channels', 'targets', 'overview'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success('渠道已保存，请授权给接入应用后发送测试');
    },
  });
  function edit(c: Channel | null) {
    save.reset();
    setEditing(c);
    form.resetFields();
    const first = plugins.data?.[0];
    form.setFieldsValue(
      c
        ? {
            name: c.name,
            plugin: `${c.type}@${c.pluginVersion}`,
            enabled: c.enabled,
            targetConfig: c.targets[0]?.config ?? {},
            credentials: {},
          }
        : {
            plugin: first ? `${first.id}@${first.version}` : undefined,
            enabled: true,
            credentials: {},
            targetConfig: {},
          },
    );
  }
  const pluginName = (c: Channel) =>
    plugins.data?.find((p) => p.id === c.type && p.version === c.pluginVersion)?.name ?? c.type;
  return (
    <>
      <PageTitle
        title="渠道管理"
        description="选择渠道插件，配置机器人与接收目标；凭证加密保存。"
        actions={
          <>
            <Button icon={<SendOutlined />} onClick={() => setTest(true)}>
              发送测试
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!plugins.data?.length}
              onClick={() => edit(null)}
            >
              添加渠道
            </Button>
          </>
        }
      />
      <QueryState
        loading={query.isLoading || plugins.isLoading}
        error={query.error ?? plugins.error}
        retry={() => {
          void query.refetch();
          void plugins.refetch();
        }}
      >
        <Card
          title={
            <>
              <ApiOutlined /> 已加载插件
            </>
          }
          className="mb16"
          size="small"
          extra={<Link to="/docs/plugins">插件开发指南 →</Link>}
        >
          <Space wrap>
            {plugins.data?.map((p) => (
              <Tag
                key={`${p.id}@${p.version}`}
                title={p.description}
                color={p.testOnly ? 'orange' : 'blue'}
              >
                {p.name} · v{p.version} · 文本
              </Tag>
            ))}
          </Space>
          <div className="cell-secondary mt16">
            一个插件可创建多个渠道实例。内置插件随镜像发布，更新后重启生效。
          </div>
        </Card>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data}
            pagination={false}
            scroll={{ x: 800 }}
            columns={[
              { title: '渠道名称', dataIndex: 'name', render: (v) => <b>{v}</b> },
              {
                title: '渠道 ID',
                dataIndex: 'shortId',
                render: (id: string) => (
                  <Typography.Text code copyable={{ text: id }} title="用于推送 API 的 target.ids">
                    {id}
                  </Typography.Text>
                ),
              },
              {
                title: '渠道插件',
                render: (_, c: Channel) => (
                  <>
                    <Tag>{pluginName(c)}</Tag>
                    <span className="cell-secondary">
                      v{c.pluginVersion} · 配置 v{c.configVersion}
                    </span>
                  </>
                ),
              },
              {
                title: '最近发送状态',
                render: (_, c: Channel) => (
                  <Badge
                    status={
                      c.lastStatus === 'healthy'
                        ? 'success'
                        : c.lastStatus === 'untested'
                          ? 'default'
                          : 'warning'
                    }
                    text={
                      c.lastStatus === 'healthy'
                        ? '最近正常'
                        : c.lastStatus === 'untested'
                          ? '未测试'
                          : '需关注'
                    }
                  />
                ),
              },
              {
                title: '启停',
                render: (_, c: Channel) => (
                  <Tag color={c.enabled ? 'blue' : 'default'}>
                    {c.enabled ? '已启用' : '已停用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                render: (_, c: Channel) => (
                  <Button type="link" onClick={() => edit(c)}>
                    编辑
                  </Button>
                ),
              },
            ]}
            locale={{ emptyText: '暂无渠道，选择插件并添加一个机器人' }}
          />
        </Card>
      </QueryState>
      <Modal
        title={editing ? '编辑渠道' : '添加渠道'}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okButtonProps={{ disabled: !plugin }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {save.error && <Alert type="error" title={save.error.message} className="mb16" />}
        {selected && !plugin && (
          <Alert
            type="error"
            title="原渠道绑定的插件版本未加载，请恢复对应插件版本。"
            className="mb16"
          />
        )}
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="渠道名称" rules={[{ required: true }]}>
            <Input placeholder="例如：财务通知群" maxLength={80} />
          </Form.Item>
          <Form.Item name="plugin" label="渠道插件" rules={[{ required: true }]}>
            <Select
              disabled={!!editing}
              onChange={() => form.resetFields(['credentials', 'targetConfig'])}
              options={plugins.data?.map((p) => ({
                value: `${p.id}@${p.version}`,
                label: `${p.name} · v${p.version}`,
              }))}
            />
          </Form.Item>
          {plugin && (
            <>
              <Alert
                type="info"
                title={plugin.description}
                className="mb16"
                description={`文本上限 ${plugin.capabilities.maxTextBytes} 字节；每渠道实例 ${plugin.rateLimit.capacity} 条 / ${plugin.rateLimit.intervalMs / 1000} 秒。`}
              />
              <PluginFields
                schema={plugin.configSchema}
                ui={plugin.uiSchema.config}
                group="credentials"
                preserveExisting={!!editing}
              />
            </>
          )}
          {plugin && (
            <PluginFields
              schema={plugin.targetSchema}
              ui={plugin.uiSchema.target}
              group="targetConfig"
            />
          )}
          <Form.Item name="enabled" label="启用渠道" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <TestSend open={test} onClose={() => setTest(false)} />
    </>
  );
}
