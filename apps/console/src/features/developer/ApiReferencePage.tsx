import { Component, lazy, Suspense, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';

const SwaggerReference = lazy(() => import('./SwaggerReference'));
const RedocReference = lazy(() => import('./RedocReference'));

class ReferenceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Alert
        type="error"
        title="文档视图加载失败"
        action={<Button onClick={() => window.location.reload()}>重新加载</Button>}
      />
    ) : (
      this.props.children
    );
  }
}
export default function ApiReferencePage({ viewer }: { viewer: 'swagger' | 'redoc' }) {
  const schema = useQuery({
    queryKey: ['public-openapi'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/openapi.json', { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('OpenAPI 契约暂时无法获取');
      return response.json() as Promise<Record<string, unknown>>;
    },
    staleTime: 60000,
  });
  return (
    <>
      <PageTitle
        title={viewer === 'swagger' ? 'Swagger UI · 在线调试' : 'ReDoc · 接口参考'}
        description="通知发送与查询接口。与 API 接入和插件开发指南一起，组成公开的开发文档。"
        actions={
          <Button href="/openapi.json" target="_blank" rel="noreferrer">
            查看 OpenAPI JSON ↗
          </Button>
        }
      />
      <DocsNavigation />
      {viewer === 'swagger' && (
        <Alert
          type="info"
          showIcon
          title="先在 Authorize 中填写 API Key（无需 Bearer 前缀），再展开接口并选择 Try it out。Execute 会向当前实例发起真实请求；密钥仅保存在当前视图内存中。"
        />
      )}
      {schema.error ? (
        <Alert
          type="error"
          title={schema.error.message}
          action={<Button onClick={() => void schema.refetch()}>重试</Button>}
        />
      ) : (
        <div className={`api-reference ${viewer}-reference`}>
          {schema.isLoading ? (
            <div className="state-center">
              <Spin />
            </div>
          ) : (
            schema.data && (
              <ReferenceBoundary key={viewer}>
                <Suspense
                  fallback={
                    <div className="state-center">
                      <Spin />
                    </div>
                  }
                >
                  {viewer === 'swagger' ? (
                    <SwaggerReference spec={schema.data} />
                  ) : (
                    <RedocReference spec={schema.data} />
                  )}
                </Suspense>
              </ReferenceBoundary>
            )
          )}
        </div>
      )}
    </>
  );
}
