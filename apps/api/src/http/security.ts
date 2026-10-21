import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IdentityService, secretEqual } from '@msgdock/server';
export type AdminRequest = FastifyRequest & {
  admin: { id: string; username: string; role: string };
};
export function checkOrigin(req: FastifyRequest) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException('拒绝跨站写入');
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = process.env.PUBLIC_URL
    ? new URL(process.env.PUBLIC_URL).origin
    : `${req.protocol}://${req.host}`;
  if (origin !== allowed) throw new ForbiddenException('请求来源不匹配');
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const session = await this.identity.session(req.cookies.md_session);
    if (!session) throw new UnauthorizedException('请先登录');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      checkOrigin(req);
      const csrf = req.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !secretEqual(csrf, session.csrfToken))
        throw new ForbiddenException('CSRF 校验失败');
    }
    req.admin = session.user;
    return true;
  }
}
