import { BadRequestException } from '@nestjs/common';
import Mustache from 'mustache';
import { createHash } from 'node:crypto';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const requestHash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export function renderText(body: string, variables: Record<string, unknown> = {}) {
  const names = [...body.matchAll(/{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g)].map((m) => m[1]!);
  if (body.replace(/{{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*}}/g, '').includes('{{'))
    throw new BadRequestException('首版模板只支持 {{variable}} 变量');
  for (const name of names)
    if (
      ['__proto__', 'prototype', 'constructor'].includes(name) ||
      !Object.hasOwn(variables, name) ||
      !['string', 'number', 'boolean'].includes(typeof variables[name])
    )
      throw new BadRequestException(`模板变量 ${name} 缺失或类型无效`);
  return Mustache.render(
    body,
    Object.fromEntries(names.map((n) => [n, variables[n]])),
    {},
    { escape: (value) => String(value) },
  );
}
