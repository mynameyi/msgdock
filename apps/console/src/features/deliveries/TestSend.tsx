import { App, Alert, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTargets } from '../channels/api';
import { testSend } from './api';
export function TestSend({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const targets = useQuery({ queryKey: ['targets'], queryFn: getTargets, enabled: open });
  const send = useMutation({
    mutationFn: testSend,
    onSuccess: async () => {
      message.success('通知已受理，请在投递记录中查看平台结果');
      await cache.invalidateQueries({ queryKey: ['overview'] });
      await cache.invalidateQueries({ queryKey: ['deliveries'] });
      form.resetFields();
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      title="发送测试"
      okText="发送通知"
      cancelText="取消"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={send.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="这将向选定 IM 目标发送真实通知。受理成功后，平台结果在投递记录中更新。"
        className="mb16"
      />
      {send.error && <Alert type="error" title={send.error.message} className="mb16" />}
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => send.mutate(v)}
        initialValues={{ text: '这是一条来自 MsgDock（信港）的测试通知。' }}
      >
        <Form.Item
          label="渠道"
          name="targetIds"
          rules={[{ required: true, message: '请选择渠道' }]}
        >
          <Select
            mode="multiple"
            placeholder="选择接收通知的渠道"
            options={targets.data
              ?.filter((t) => t.channel.enabled)
              .map((t) => ({
                label: `${t.channel.name} · ${t.channel.shortId}`,
                value: t.channel.shortId,
              }))}
          />
        </Form.Item>
        <Form.Item label="消息内容" name="text" rules={[{ required: true }]}>
          <Input.TextArea rows={4} maxLength={2000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
