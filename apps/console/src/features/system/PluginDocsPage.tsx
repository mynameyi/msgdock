import { Children, isValidElement, type ReactNode, useEffect } from 'react';
import { Button, Card, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';
import guide from '../../../../../docs/channel-plugins.md?raw';
import guideUrl from '../../../../../docs/channel-plugins.md?url';
import { PageTitle } from '../../shared/ui';
import { DocsNavigation } from './DocsNavigation';

const anchorId = (title: string) => `plugin-${title.trim().replace(/\s+/g, '-')}`;
const sections = [...guide.matchAll(/^## (.+)$/gm)].map((match) => ({
  title: match[1]!.trim(),
  id: anchorId(match[1]!),
}));
const sourceBase = 'https://github.com/mynameyi/msgdock/blob/main/docs/';
const components: Components = {
  h1: () => null,
  h2: ({ children }) => <h2 id={anchorId(String(children))}>{children}</h2>,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    if (href.startsWith('#')) return <a href={href}>{children}</a>;
    return (
      <a href={new URL(href, sourceBase).href} target="_blank" rel="noreferrer">
        {children} ↗
      </a>
    );
  },
  table: ({ children }) => (
    <div className="plugin-guide-table">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => {
    const code = Children.toArray(children)[0];
    const props = isValidElement<{ children?: ReactNode; className?: string }>(code)
      ? code.props
      : undefined;
    const text = String(props?.children ?? '').replace(/\n$/, '');
    const language = props?.className?.replace('language-', '') ?? '示例';
    return (
      <div className="plugin-guide-code">
        <div className="plugin-guide-codebar">
          <span>{language}</span>
          <Typography.Text copyable={{ text, tooltips: ['复制代码', '已复制'] }}>
            复制
          </Typography.Text>
        </div>
        <pre>{children}</pre>
      </div>
    );
  },
};

export function PluginDocsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    try {
      const id = decodeURIComponent(hash.slice(1));
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    } catch {
      /* Ignore malformed links; keep the guide readable. */
    }
  }, [hash]);
  return (
    <>
      <PageTitle
        title="插件开发"
        description="了解渠道插件的接口、配置、执行边界与接入流程。"
        actions={
          <Button href={guideUrl} download="MsgDock-Channel-Plugins.md" icon={<DownloadOutlined />}>
            下载开发约定
          </Button>
        }
      />
      <DocsNavigation />
      <div className="plugin-guide-layout">
        <aside className="plugin-guide-toc">
          <Card title="本页目录" size="small">
            <nav aria-label="插件开发目录">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </Card>
        </aside>
        <Card className="plugin-guide-content">
          <div className="plugin-guide-heading">
            <span>渠道插件开发与运行约定</span>
            <Tag color="blue">SDK API v1</Tag>
          </div>
          <article className="plugin-guide-article" aria-label="渠道插件开发与运行约定">
            <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
              {guide}
            </Markdown>
          </article>
        </Card>
      </div>
    </>
  );
}
