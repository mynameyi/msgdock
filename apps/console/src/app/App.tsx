import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  ConfigProvider,
  Layout,
  Menu,
  Spin,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  ApiOutlined,
  AppstoreOutlined,
  BookOutlined,
  BranchesOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { getBootstrap, getSession, logout, Session } from '../features/identity/api';
import { IdentityPage } from '../features/identity/IdentityPage';
import { setCsrfToken } from '../shared/api';
const OverviewPage = lazy(() =>
  import('../features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const ApplicationsPage = lazy(() =>
  import('../features/applications/ApplicationsPage').then((m) => ({
    default: m.ApplicationsPage,
  })),
);
const ChannelsPage = lazy(() =>
  import('../features/channels/ChannelsPage').then((m) => ({ default: m.ChannelsPage })),
);
const TemplatesPage = lazy(() =>
  import('../features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
);
const RoutingPage = lazy(() =>
  import('../features/routing/RoutingPage').then((m) => ({ default: m.RoutingPage })),
);
const DeliveriesPage = lazy(() =>
  import('../features/deliveries/DeliveriesPage').then((m) => ({ default: m.DeliveriesPage })),
);
const SystemPage = lazy(() =>
  import('../features/system/SystemPage').then((m) => ({ default: m.SystemPage })),
);
const DocsPage = lazy(() =>
  import('../features/system/DocsPage').then((m) => ({ default: m.DocsPage })),
);
import { getSystem } from '../features/system/api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 10000 } },
});
const navigation = [
  { key: '/', label: '概览', icon: <DashboardOutlined /> },
  { key: '/deliveries', label: '消息投递', icon: <SendOutlined /> },
  { key: '/channels', label: '渠道管理', icon: <ApiOutlined /> },
  { key: '/templates', label: '消息模板', icon: <FileTextOutlined /> },
  { key: '/routing', label: '主题路由', icon: <BranchesOutlined /> },
  { key: '/applications', label: '接入应用', icon: <AppstoreOutlined /> },
];
const lowerNavigation = [
  { key: '/settings', label: '系统设置', icon: <SettingOutlined /> },
  { key: '/docs', label: 'API 文档', icon: <BookOutlined /> },
];
function Shell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const location = useLocation(),
    navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const system = useQuery({ queryKey: ['system'], queryFn: getSystem, refetchInterval: 15000 });
  const title =
    [...navigation, ...lowerNavigation].find((n) => n.key === location.pathname)?.label ?? '概览';
  return (
    <Layout className="app-layout">
      <Layout.Sider
        width={196}
        collapsedWidth={64}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={setCollapsed}
        theme="light"
        className="sidebar"
      >
        <Link to="/" className="brand">
          <span className="brand-mark">M</span>
          {!collapsed && (
            <span className="brand-copy">
              <b>MsgDock</b>
              <small>信港 · 消息推送引擎</small>
            </span>
          )}
        </Link>
        {!collapsed && <p className="nav-caption">工作空间</p>}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navigation}
          onClick={(v) => navigate(v.key)}
        />
        <div className="sidebar-bottom">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={lowerNavigation}
            onClick={(v) => navigate(v.key)}
          />
          {!collapsed && (
            <div className="instance-state">
              <Badge
                status={system.data?.workerReady && system.data.redisReady ? 'success' : 'warning'}
                text={
                  system.data?.workerReady && system.data.redisReady
                    ? '服务运行正常'
                    : '正在检查服务'
                }
              />
              <small>v0.1.0 · 私有部署</small>
            </div>
          )}
        </div>
      </Layout.Sider>
      <Layout className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">默认工作空间</span>
            <span className="crumb-divider">/</span>
            {title}
          </div>
          <div className="topbar-user">
            <Avatar size={28}>{session.user.username[0]?.toUpperCase()}</Avatar>
            <span>{session.user.username}</span>
            <Button
              aria-label="退出登录"
              type="text"
              icon={<LogoutOutlined />}
              onClick={onLogout}
            />
          </div>
        </header>
        <main className="content">
          {system.data?.testMode && (
            <Alert
              className="mb16"
              type="warning"
              showIcon
              title="集成测试实例 · 测试渠道不会发送到真实 IM"
            />
          )}
          <Suspense
            fallback={
              <div className="state-center">
                <Spin />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/deliveries" element={<DeliveriesPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/routing" element={<RoutingPage />} />
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/settings" element={<SystemPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <footer className="app-footer">
            <span>MsgDock © 2026</span>
            <a href="https://github.com/mynameyi/msgdock" target="_blank" rel="noreferrer">
              源码 · AGPL-3.0-only ↗
            </a>
          </footer>
        </main>
      </Layout>
    </Layout>
  );
}
function Gate() {
  const cache = useQueryClient();
  const bootstrap = useQuery({ queryKey: ['bootstrap'], queryFn: getBootstrap });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession, retry: false });
  const [session, setSession] = useState<Session>();
  useEffect(() => {
    const expired = () => {
      setSession(undefined);
      setCsrfToken('');
      cache.clear();
    };
    window.addEventListener('msgdock:session-expired', expired);
    return () => window.removeEventListener('msgdock:session-expired', expired);
  }, [cache]);
  useEffect(() => {
    if (sessionQuery.data) {
      setCsrfToken(sessionQuery.data.csrfToken);
      setSession(sessionQuery.data);
    }
  }, [sessionQuery.data]);
  function signedIn(value: Session) {
    cache.clear();
    setCsrfToken(value.csrfToken);
    setSession(value);
  }
  async function signedOut() {
    try {
      await logout();
    } finally {
      setSession(undefined);
      setCsrfToken('');
      cache.clear();
    }
  }
  if (bootstrap.isLoading || sessionQuery.isLoading)
    return (
      <div className="identity-screen">
        <Spin size="large" />
      </div>
    );
  if (bootstrap.error)
    return (
      <div className="identity-screen">
        <Alert
          type="error"
          title="服务连接失败"
          description={bootstrap.error.message}
          action={<Button onClick={() => bootstrap.refetch()}>重试</Button>}
        />
      </div>
    );
  return session ? (
    <Shell session={session} onLogout={() => void signedOut()} />
  ) : (
    <IdentityPage needsSetup={bootstrap.data?.needsSetup ?? false} onLogin={signedIn} />
  );
}
export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#3569ef',
          borderRadius: 8,
          fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif',
          colorBgLayout: '#f5f7fa',
          colorText: '#18243a',
          colorTextSecondary: '#708096',
          fontSize: 13,
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
          Menu: { itemHeight: 42, itemSelectedBg: '#edf3ff', itemSelectedColor: '#3569ef' },
          Card: { headerFontSize: 14, headerHeight: 55 },
          Table: { headerBg: '#f7f9fc' },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
