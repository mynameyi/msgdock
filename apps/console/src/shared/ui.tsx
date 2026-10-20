import { Alert, Button, Empty, Spin, Tag } from 'antd';
import { ReactNode } from 'react';
import { statusColors, statusNames } from './api';
export function StatusTag({ status }: { status: string }) {
  return <Tag color={statusColors[status]}>{statusNames[status] ?? status}</Tag>;
}
export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function QueryState({
  loading,
  error,
  retry,
  empty,
  children,
}: {
  loading: boolean;
  error: Error | null;
  retry: () => unknown;
  empty?: boolean;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="state-center">
        <Spin />
      </div>
    );
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title="加载失败"
        description={error.message}
        action={<Button onClick={() => retry()}>重试</Button>}
      />
    );
  if (empty) return <Empty description="暂无数据" />;
  return <>{children}</>;
}
export const number = (value: number) => value.toLocaleString('zh-CN');
