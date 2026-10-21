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
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { NotificationsService } from '@msgdock/server';
import { NotificationDto } from './dto';
import {
  AcceptedNotificationDto,
  ApiErrorDto,
  DeliveryPageDto,
  DeliveryResultDto,
  NotificationResultDto,
} from './notification-responses';
@ApiTags('通知 API')
@ApiParam({ name: 'appKey', description: '控制台中配置的接入应用 Key', example: 'order-service' })
@ApiResponse({ status: 400, description: '参数、目标、消息或幂等键无效', type: ApiErrorDto })
@ApiResponse({ status: 401, description: '需要有效的应用 API Key', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'API Key 不属于该应用或无权访问目标', type: ApiErrorDto })
@ApiResponse({
  status: 503,
  description: '服务暂时不可用或投递积压达到受理上限',
  type: ApiErrorDto,
})
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
    name: 'idempotency-key',
    required: true,
    description: '应用内唯一，1–200 个可见 ASCII 字符',
    example: 'replace-with-your-unique-event-id',
  })
  @ApiBody({
    type: NotificationDto,
    examples: {
      text: {
        summary: '文本消息（替换目标 UUID）',
        value: {
          event: 'order.paid',
          target: { type: 'targets', ids: ['00000000-0000-4000-8000-000000000001'] },
          message: { text: '订单支付成功。' },
          expires_in: 3600,
        },
      },
      template: {
        summary: '主题与模板（先在控制台创建）',
        value: {
          event: 'order.paid',
          target: { type: 'topic', key: 'finance' },
          template: { key: 'order_paid' },
          variables: { order_no: '20261021001', amount: '299.00' },
          expires_in: 3600,
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: '已持久化受理，平台投递在后台进行',
    type: AcceptedNotificationDto,
  })
  @ApiResponse({ status: 409, description: '相同幂等键对应不同请求', type: ApiErrorDto })
  @ApiResponse({ status: 429, description: '应用发送频率超限', type: ApiErrorDto })
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
  @ApiOperation({
    summary: '查询通知及投递概况',
    description: '始终需要该应用的 API Key，包括发送采用非鉴权模式的应用。',
  })
  @ApiResponse({ status: 200, type: NotificationResultDto })
  @ApiResponse({ status: 404, description: '通知不存在或不属于该应用', type: ApiErrorDto })
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
  @ApiOperation({
    summary: '分页查询通知的投递结果',
    description: '每页最多 50 条。使用返回的 nextCursor 继续查询；null 表示末页。',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: '上一页返回的 nextCursor',
  })
  @ApiResponse({ status: 200, type: DeliveryPageDto })
  @ApiResponse({ status: 404, description: '通知不存在或不属于该应用', type: ApiErrorDto })
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
  @ApiOperation({ summary: '查询单个目标的投递结果' })
  @ApiResponse({ status: 200, type: DeliveryResultDto })
  @ApiResponse({ status: 404, description: '投递不存在或不属于该应用', type: ApiErrorDto })
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
