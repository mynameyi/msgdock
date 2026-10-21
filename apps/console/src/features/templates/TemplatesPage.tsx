import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Modal, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getTemplates, saveTemplate } from './api';
import { Template } from '../../shared/api';
import { PageTitle, QueryState } from '../../shared/ui';
export function TemplatesPage() {
  const query = useQuery({ queryKey: ['templates'], queryFn: getTemplates });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Template | null | undefined>();
  const [form] = Form.useForm();
  const save = useMutation({
    mutationFn: (v: any) => saveTemplate(v, editing?.id),
    onSuccess: async () => {
      setEditing(undefined);
      await cache.invalidateQueries({ queryKey: ['templates'] });
      message.success('模板新版本已保存，已有投递使用原快照');
    },
  });
  function edit(t: Template | null) {
    save.reset();
    setEditing(t);
    form.resetFields();
    form.setFieldsValue(t ? { key: t.key, name: t.name, body: t.versions[0]?.body } : {});
  }
  return (
    <>
      <PageTitle
        title="消息模板"
        description="复用文本模板；每次保存创建不可变版本。"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
            创建模板
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
                title: '模板',
                render: (_, t: Template) => (
                  <>
                    <b>{t.name}</b>
                    <span className="cell-secondary">{t.key}</span>
                  </>
                ),
              },
              {
                title: '最新版本',
                render: (_, t: Template) => <Tag color="blue">v{t.versions[0]?.version ?? 1}</Tag>,
              },
              {
                title: '内容预览',
                render: (_, t: Template) => (
                  <span className="preview-line">{t.versions[0]?.body}</span>
                ),
              },
              {
                title: '操作',
                render: (_, t: Template) => (
                  <Button type="link" onClick={() => edit(t)}>
                    编辑 / 新版本
                  </Button>
                ),
              },
            ]}
            locale={{ emptyText: '暂无模板；可以先用纯文本消息发送测试' }}
            scroll={{ x: 680 }}
          />
        </Card>
      </QueryState>
      <Modal
        title={editing ? `编辑模板 · 当前 v${editing.versions[0]?.version}` : '创建模板'}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText="保存新版本"
        cancelText="取消"
        destroyOnHidden
      >
        {save.error && <Alert type="error" title={save.error.message} className="mb16" />}
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="订单支付提醒" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="key"
            label="模板标识"
            rules={[
              { required: true },
              {
                pattern: /^[a-z][a-z0-9_-]{1,49}$/,
                message: '2–50 位小写字母、数字、下划线或短横线',
              },
            ]}
          >
            <Input placeholder="order_paid" />
          </Form.Item>
          <Form.Item
            name="body"
            label="模板内容"
            rules={[{ required: true }]}
            extra="使用 {{order_no}} 形式的变量；只支持文本、数字或布尔值。"
          >
            <Input.TextArea
              rows={6}
              maxLength={5000}
              showCount
              placeholder={'订单 {{order_no}} 已支付，金额 {{amount}} 元。'}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
