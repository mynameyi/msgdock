import { useEffect } from 'react';
import { GithubOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import './public.css';

export function PublicLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'MsgDock 信港 · 开源消息推送引擎',
      '/docs': '开发文档 · MsgDock',
      '/docs/plugins': '渠道插件开发 · MsgDock',
      '/docs/swagger': 'Swagger UI · MsgDock',
      '/docs/redoc': 'ReDoc · MsgDock',
    };
    document.title = titles[pathname] ?? 'MsgDock 信港';
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="public-site">
      <a className="skip-link" href="#public-content">
        跳转到正文
      </a>
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="MsgDock 信港首页">
            <span className="brand-mark">M</span>
            <b>
              MsgDock<span>信港</span>
            </b>
          </Link>
          <nav aria-label="主导航">
            <NavLink to="/" end>
              产品介绍
            </NavLink>
            <NavLink to="/docs">开发文档</NavLink>
            <a
              className="public-github"
              href="https://github.com/mynameyi/msgdock"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 源码"
            >
              <GithubOutlined /> <span>GitHub</span>
            </a>
            <Link className="public-console-link" to="/console">
              管理控制台 <ArrowRightOutlined />
            </Link>
          </nav>
        </div>
      </header>
      <main id="public-content" className={pathname === '/' ? 'landing-main' : 'public-docs'}>
        <Outlet />
      </main>
      <footer className="public-footer">
        <div>
          <b>
            MsgDock <span>信港</span>
          </b>
          <p>一次接入，消息通达。</p>
        </div>
        <div>
          <Link to="/docs">开发文档</Link>
          <a href="https://github.com/mynameyi/msgdock" target="_blank" rel="noreferrer">
            源码 · AGPL-3.0-only ↗
          </a>
          <span>© 2026 MsgDock contributors</span>
        </div>
      </footer>
    </div>
  );
}
