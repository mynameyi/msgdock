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
  Switch,
  Table,
  Tag,
} from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import { getChannels, saveChannel } from './api';
import { Channel, channelNames } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';
import { TestSend } from '../deliveries/TestSend';
export function ChannelsPage() {
  const query = useQuery({ queryKey: ['channels'], queryFn: getChannels });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Channel | null | undefined>();
  const [test, setTest] = useState(false);
  const [form] = Form.useForm();
  const type = Form.useWatch('type', form);
  const save = useMutation({
    mutationFn: (v: any) => saveChannel(v, editing?.id),
    onSuccess: async () => {
      setEditing(undefined);
      await cache.invalidateQueries({ queryKey: ['channels'] });
      await cache.invalidateQueries({ queryKey: ['targets'] });
      await cache.invalidateQueries({ queryKey: ['overview'] });
      message.success('渠道已保存，请授权给接入应用后发送测试');
    },
  });
  function edit(c: Channel | null) {
    save.reset();
    setEditing(c);
    form.resetFields();
    form.setFieldsValue(
      c
        ? {
            name: c.name,
            type: c.type,
            enabled: c.enabled,
            targetName: c.targets[0]?.name,
            openConversationId: c.targets[0]?.config.openConversationId,
            credentials: {},
          }
        : { type: 'wecom.group_webhook', enabled: true, credentials: {} },
    );
  }
  return (
    <>
      <PageTitle
        title="渠道管理"
        description="集中配置机器人与发送目标；凭证加密保存。"
        actions={
          <>
            <Button icon={<SendOutlined />} onClick={() => setTest(true)}>
              发送测试
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
              添加渠道
            </Button>
          </>
        }
      />
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data}
            pagination={false}
            scroll={{ x: 700 }}
            columns={[
              { title: '渠道名称', dataIndex: 'name', render: (v) => <b>{v}</b> },
              {
                title: '平台',
                dataIndex: 'type',
                render: (v) => <Tag>{channelNames[v] ?? v}</Tag>,
              },
              { title: '接收目标', render: (_, c: Channel) => c.targets[0]?.name ?? '—' },
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
            locale={{ emptyText: '暂无渠道，先添加一个机器人' }}
          />
        </Card>
        <Alert
          className="mt16"
          type="info"
          showIcon
          title="首版支持企业微信与飞书群机器人、钉钉企业机器人文本通知。微信和智能机器人长连接能力将在后续版本接入。"
        />
      </QueryState>
      <Modal
        title={editing ? '编辑渠道' : '添加渠道'}
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
          <Form.Item name="name" label="渠道名称" rules={[{ required: true }]}>
            <Input placeholder="订单通知机器人" maxLength={80} />
          </Form.Item>
          <Form.Item name="type" label="渠道类型" rules={[{ required: true }]}>
            <Select
              disabled={!!editing}
              options={Object.entries(channelNames)
                .filter(([k]) => k !== 'mock')
                .map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          {type === 'dingtalk.enterprise_bot' ? (
            <>
              <Form.Item
                name={['credentials', 'appKey']}
                label="AppKey"
                rules={[{ required: !editing }]}
              >
                <Input.Password
                  autoComplete="off"
                  placeholder={editing ? '留空保留原值' : '企业内部应用 AppKey'}
                />
              </Form.Item>
              <Form.Item
                name={['credentials', 'appSecret']}
                label="AppSecret"
                rules={[{ required: !editing }]}
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder={editing ? '留空保留原值' : '企业内部应用 AppSecret'}
                />
              </Form.Item>
              <Form.Item
                name={['credentials', 'robotCode']}
                label="RobotCode"
                rules={[{ required: !editing }]}
              >
                <Input placeholder={editing ? '留空保留原值' : '机器人 RobotCode'} />
              </Form.Item>
              <Form.Item
                name="openConversationId"
                label="OpenConversationId"
                rules={[{ required: true }]}
                extra="机器人须加入目标群，并完成对应 API 权限授权。"
              >
                <Input placeholder="目标群的开放会话标识" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name={['credentials', 'webhookUrl']}
                label="Webhook 地址"
                rules={[{ required: !editing }]}
                extra={
                  editing
                    ? '已有凭证不会返回到浏览器；留空保留原值。'
                    : '仅接受对应平台官方 HTTPS Webhook 地址。'
                }
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder={editing ? '留空保留原值' : 'https://…'}
                />
              </Form.Item>
              {type === 'feishu.group_webhook' && (
                <Form.Item
                  name={['credentials', 'secret']}
                  label="签名密钥（如机器人启用了签名校验）"
                >
                  <Input.Password
                    autoComplete="new-password"
                    placeholder={editing ? '留空保留原值' : '可选，填写飞书机器人签名密钥'}
                  />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item name="targetName" label="目标名称" rules={[{ required: true }]}>
            <Input placeholder="财务通知群" maxLength={80} />
          </Form.Item>
          <Form.Item name="enabled" label="启用渠道" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <TestSend open={test} onClose={() => setTest(false)} />
    </>
  );
}
