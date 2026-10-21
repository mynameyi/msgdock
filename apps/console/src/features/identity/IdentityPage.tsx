import { Alert, Button, Form, Input, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { login, setup, Session } from './api';
export function IdentityPage({
  needsSetup,
  onLogin,
}: {
  needsSetup: boolean;
  onLogin: (value: Session) => void;
}) {
  const mutation = useMutation({
    mutationFn: (values: { username: string; password: string; setupToken: string }) =>
      needsSetup ? setup(values) : login({ username: values.username, password: values.password }),
    onSuccess: onLogin,
  });
  return (
    <div className="identity-screen">
      <div className="identity-brand">
        <span className="brand-mark">M</span>
        <h1>
          MsgDock <span>信港</span>
        </h1>
        <p>一次接入，消息通达。</p>
      </div>
      <section className="identity-panel">
        <h2>{needsSetup ? '初始化你的消息中心' : '欢迎回来'}</h2>
        <p className="muted">
          {needsSetup
            ? '创建首位管理员，开始管理你的消息渠道。'
            : '登录管理控制台，查看每一条消息的去向。'}
        </p>
        {mutation.error && <Alert type="error" showIcon title={mutation.error.message} />}
        <Form
          layout="vertical"
          onFinish={(v) => mutation.mutate(v)}
          initialValues={{ username: 'admin' }}
        >
          {needsSetup && (
            <Form.Item
              label="初始化令牌"
              name="setupToken"
              rules={[{ required: true, message: '请输入初始化令牌' }]}
              extra={
                <span>
                  在部署主机运行{' '}
                  <Typography.Text code>
                    docker exec msgdock cat /data/secrets/setup-token
                  </Typography.Text>
                </span>
              }
            >
              <Input.Password autoComplete="off" placeholder="粘贴部署实例的初始化令牌" />
            </Form.Item>
          )}
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true },
              {
                pattern: /^[a-zA-Z0-9_.-]{3,40}$/,
                message: '3–40 位字母、数字、下划线、点或短横线',
              },
            ]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 12, message: '密码至少 12 位' },
            ]}
          >
            <Input.Password
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              placeholder="至少 12 位"
              maxLength={128}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={mutation.isPending}>
            {needsSetup ? '创建管理员并进入控制台' : '登录'}
          </Button>
        </Form>
        <div className="identity-foot">自托管 · AGPL-3.0-only · v0.2.0</div>
      </section>
    </div>
  );
}
