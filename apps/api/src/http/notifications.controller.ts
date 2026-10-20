import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { NotificationsService } from '@msgdock/server';
import { NotificationDto } from './dto';
@ApiTags('通知 API')
@Controller('api/v1/apps/:appKey')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Post('notifications')
  @HttpCode(202)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '受理通知（默认需要 Bearer API Key；仅显式关闭鉴权的应用允许匿名发送）',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '应用内唯一，1–200 个可见 ASCII 字符',
  })
  @ApiResponse({ status: 202, description: '已持久化受理，平台投递在后台进行' })
  async create(
    @Param('appKey') key: string,
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: NotificationDto,
    @Req() req: FastifyRequest,
  ) {
    const app = await this.service.authenticate(key, auth);
    return {
      ...(await this.service.accept(app.id, body, idempotencyKey ?? '')),
      request_id: req.id,
    };
  }
  @Get('notifications/:id')
  @ApiBearerAuth()
  async get(
    @Param('appKey') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') auth?: string,
  ) {
    if (!auth) throw new UnauthorizedException('结果查询需要 API Key');
    const app = await this.service.authenticate(key, auth);
    return this.service.query(app.id, id);
  }
  @Get('notifications/:id/deliveries')
  @ApiBearerAuth()
  @ApiQuery({ name: 'cursor', required: false })
  async deliveries(
    @Param('appKey') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') auth?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!auth) throw new UnauthorizedException('结果查询需要 API Key');
    const app = await this.service.authenticate(key, auth);
    return this.service.queryDeliveries(app.id, id, cursor);
  }
  @Get('deliveries/:id')
  @ApiBearerAuth()
  async delivery(
    @Param('appKey') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') auth?: string,
  ) {
    if (!auth) throw new UnauthorizedException('结果查询需要 API Key');
    const app = await this.service.authenticate(key, auth);
    return this.service.queryDelivery(app.id, id);
  }
}
