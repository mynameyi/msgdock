import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IdentityService, ServiceError, secretEqual } from '@msgdock/server';
export type AdminRequest = FastifyRequest & {
  admin: { id: string; username: string; role: string };
};
export function checkOrigin(req: FastifyRequest) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ServiceError('ORIGIN_NOT_ALLOWED');
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = process.env.PUBLIC_URL
    ? new URL(process.env.PUBLIC_URL).origin
    : `${req.protocol}://${req.host}`;
  if (origin !== allowed) throw new ServiceError('ORIGIN_NOT_ALLOWED');
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const session = await this.identity.session(req.cookies.md_session);
    if (!session) throw new ServiceError('SESSION_REQUIRED');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      checkOrigin(req);
      const csrf = req.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !secretEqual(csrf, session.csrfToken))
        throw new ServiceError('CSRF_INVALID');
    }
    req.admin = session.user;
    return true;
  }
}
