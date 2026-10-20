import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Modal, Select, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getTopics, saveTopic } from './api';
import { getTargets } from '../channels/api';
import { Topic } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';
export function RoutingPage() {
  const query = useQuery({ queryKey: ['topics'], queryFn: getTopics });
  const targets = useQuery({ queryKey: ['targets'], queryFn: getTargets });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Topic | null | undefined>();
  const [form] = Form.useForm();
  const save = useMutation({
    mutationFn: (v: any) => saveTopic(v, editing?.id),
    onSuccess: async () => {
      setEditing(undefined);
      await cache.invalidateQueries({ queryKey: ['topics'] });
      message.success('主题路由已保存');
    },
  });
  function edit(t: Topic | null) {
    save.reset();
    setEditing(t);
    form.resetFields();
    form.setFieldsValue(t ?? { targetIds: [] });
  }
  return (
    <>
      <PageTitle
        title="主题路由"
        description="用一个业务主题触达多个接收目标，调用时仍受应用目标授权约束。"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
            创建主题
          </Button>
        }
      />
      <QueryState loading={query.isLoading} error={query.error} retry={query.refetch}>
        <Card className="table-card">
          <Table
            rowKey="id"
            dataSource={query.data}
            pagination={false}
            columns={[
              {
                title: '主题',
                render: (_, t: Topic) => (
                  <>
                    <b>{t.name}</b>
                    <span className="cell-secondary">{t.key}</span>
                  </>
                ),
              },
              {
                title: '路由目标',
                render: (_, t: Topic) =>
                  t.targetIds.map((id) => (
                    <Tag key={id}>
                      {targets.data?.find((x) => x.id === id)?.name ?? '目标已失效'}
                    </Tag>
                  )),
              },
              {
                title: '操作',
                render: (_, t: Topic) => (
                  <Button type="link" onClick={() => edit(t)}>
                    编辑
                  </Button>
                ),
              },
            ]}
            locale={{ emptyText: '尚无主题，创建主题以便统一路由' }}
          />
        </Card>
      </QueryState>
      <Modal
        title={editing ? '编辑主题' : '创建主题'}
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
          <Form.Item name="name" label="主题名称" rules={[{ required: true }]}>
            <Input placeholder="财务通知" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="key"
            label="主题标识"
            rules={[{ required: true }, { pattern: /^[a-z][a-z0-9_-]{1,49}$/ }]}
          >
            <Input placeholder="finance" />
          </Form.Item>
          <Form.Item
            name="targetIds"
            label="接收目标"
            rules={[{ required: true, type: 'array', min: 1, message: '至少选择一个目标' }]}
          >
            <Select
              mode="multiple"
              options={targets.data?.map((t) => ({
                label: `${t.name} · ${t.channel.name}`,
                value: t.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
