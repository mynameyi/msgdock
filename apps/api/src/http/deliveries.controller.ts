import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DeliveriesService, NotificationsService, RedisService } from '@msgdock/server';
import { ReplayDto, TestSendDto } from './dto';
import { AdminRequest, SessionGuard } from './security';
@ApiTags('投递')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('api/admin')
export class DeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}
  @Get('overview') overview() {
    return this.deliveries.overview();
  }
  @Get('deliveries')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'applicationId', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  list(
    @Query('status') status?: string,
    @Query('applicationId') applicationId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.deliveries.list({ status, applicationId, cursor });
  }
  @Get('deliveries/:id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.detail(id);
  }
  @Post('deliveries/:id/cancel') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AdminRequest,
  ) {
    return this.deliveries.cancel(id, req.admin.username);
  }
  @Post('deliveries/:id/replays') replay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplayDto,
    @Req() req: AdminRequest,
  ) {
    return this.deliveries.replay(id, req.admin.username, body.reason, body.confirmed);
  }
  @Post('deliveries/:id/resolve') resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplayDto,
    @Req() req: AdminRequest,
  ) {
    return this.deliveries.resolve(id, req.admin.username, body.reason);
  }
  @Post('notifications/test') test(@Body() body: TestSendDto, @Req() req: AdminRequest) {
    return this.notifications.adminTest(
      body.applicationId,
      body.targetIds,
      body.text,
      req.admin.username,
    );
  }
  @Get('system') async system() {
    let redisReady = false;
    try {
      redisReady = (await this.redis.client.ping()) === 'PONG';
    } catch {}
    const health = await this.deliveries.health();
    return {
      version: '0.2.0',
      deployment: 'single-container',
      database: 'PostgreSQL 18',
      queue: 'Redis / BullMQ',
      authHeader: 'Authorization: Bearer <API_KEY>',
      testMode: process.env.MSGDOCK_TEST_MODE === 'true',
      redisReady,
      ...health,
    };
  }
}
