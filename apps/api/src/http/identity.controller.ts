import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { IdentityService, RedisService, sha256 } from '@msgdock/server';
import { LoginDto, SetupDto, PasswordDto } from './dto';
import { AdminRequest, SessionGuard, checkOrigin } from './security';
@ApiTags('身份')
@Controller('api/admin')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly redis: RedisService,
  ) {}
  @Get('bootstrap') status() {
    return this.identity.status();
  }
  @Get('session') async session(@Req() req: FastifyRequest) {
    const session = await this.identity.session(req.cookies.md_session);
    if (!session) throw new UnauthorizedException('请先登录');
    return session;
  }
  @Post('setup') async setup(
    @Body() body: SetupDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    checkOrigin(req);
    if (!(await this.redis.limit(`setup:${sha256(req.ip)}`, 5, 300000)))
      throw new UnauthorizedException('尝试过于频繁');
    return this.cookie(
      reply,
      await this.identity.setup(body.username, body.password, body.setupToken),
    );
  }
  @Post('login') async login(
    @Body() body: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    checkOrigin(req);
    return this.cookie(reply, await this.identity.login(body.username, body.password, req.ip));
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('logout') async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.identity.logout(req.cookies.md_session!);
    reply.clearCookie('md_session', { path: '/' });
    return { ok: true };
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('password') password(
    @Body() body: PasswordDto,
    @Req() req: AdminRequest,
  ) {
    return this.identity.changePassword(
      req.admin.id,
      body.oldPassword,
      body.newPassword,
      req.cookies.md_session!,
    );
  }
  private cookie(reply: FastifyReply, result: Awaited<ReturnType<IdentityService['login']>>) {
    reply.setCookie('md_session', result.token, {
      path: '/',
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: 12 * 3600,
    });
    return { user: result.user, csrfToken: result.csrfToken };
  }
}
