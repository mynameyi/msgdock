import { Form, Input, InputNumber, Select } from 'antd';
import type { ConfigSchema, UiField } from '@msgdock/plugin-sdk';

/** One host renderer for all installed plugins; no platform imports or platform branches. */
export function PluginFields({
  schema,
  ui,
  group,
  preserveExisting = false,
}: {
  schema: ConfigSchema;
  ui: Record<string, UiField>;
  group: 'credentials' | 'targetConfig';
  preserveExisting?: boolean;
}) {
  return Object.entries(schema.properties).map(([key, field]) => {
    const meta = ui[key]!;
    const placeholder = preserveExisting ? '留空保留原值' : meta.placeholder;
    const control = field.enum ? (
      <Select
        allowClear
        options={field.enum.map((value) => ({ value, label: value }))}
        placeholder={placeholder}
      />
    ) : field.type === 'boolean' ? (
      <Select
        allowClear
        options={[
          { value: true, label: '是' },
          { value: false, label: '否' },
        ]}
        placeholder={placeholder}
      />
    ) : field.type === 'integer' ? (
      <InputNumber
        min={field.minimum}
        max={field.maximum}
        precision={0}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
    ) : meta.widget === 'password' ? (
      <Input.Password
        autoComplete="new-password"
        maxLength={field.maxLength}
        placeholder={placeholder}
      />
    ) : meta.widget === 'textarea' ? (
      <Input.TextArea maxLength={field.maxLength} placeholder={placeholder} />
    ) : (
      <Input autoComplete="off" maxLength={field.maxLength} placeholder={placeholder} />
    );
    return (
      <Form.Item
        key={`${group}.${key}`}
        name={[group, key]}
        label={meta.label}
        preserve={false}
        extra={
          preserveExisting ? `${meta.help ?? ''} 已有配置不会返回浏览器；留空保留原值。` : meta.help
        }
        rules={[
          { required: !preserveExisting && schema.required.includes(key) },
          ...(field.type === 'string' ? [{ min: field.minLength, max: field.maxLength }] : []),
        ]}
      >
        {control}
      </Form.Item>
    );
  });
}
