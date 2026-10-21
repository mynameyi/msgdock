import { Button, Card } from 'antd';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import guide from '../../../../../docs/api-contract.md?raw';
import guideUrl from '../../../../../docs/api-contract.md?url';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';

export function ResponseDocsPage() {
  return (
    <>
      <PageTitle
        title="响应规范与错误码"
        description="区分接口处理结果与异步投递结果，正确处理幂等、失败和重试。"
        actions={
          <Button href={guideUrl} download="MsgDock-API-Contract.md">
            下载响应规范
          </Button>
        }
      />
      <DocsNavigation />
      <Card>
        <article className="plugin-guide-article">
          <Markdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              h1: () => null,
              a: ({ href, children }) => (
                <a
                  href={
                    new URL(href ?? '', 'https://github.com/mynameyi/msgdock/blob/main/docs/').href
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {children} ↗
                </a>
              ),
              table: ({ children }) => (
                <div className="plugin-guide-table">
                  <table>{children}</table>
                </div>
              ),
              pre: ({ children }) => (
                <div className="plugin-guide-code">
                  <pre>{children}</pre>
                </div>
              ),
            }}
          >
            {guide}
          </Markdown>
        </article>
      </Card>
    </>
  );
}
