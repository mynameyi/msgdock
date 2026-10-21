import { ApiOutlined, CodeOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

export function DocsNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Tabs
      className="docs-navigation"
      activeKey={location.pathname}
      onChange={navigate}
      items={[
        { key: '/docs', label: 'API 接入', icon: <ApiOutlined /> },
        { key: '/docs/plugins', label: '插件开发', icon: <CodeOutlined /> },
      ]}
    />
  );
}
