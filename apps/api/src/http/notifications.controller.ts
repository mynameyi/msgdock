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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
@ApiResponse({ status: 400, description: '参数、目标、消息或幂等键无效', type: ApiErrorDto })
@ApiResponse({ status: 401, description: '需要有效的 API Key', type: ApiErrorDto })
@ApiResponse({ status: 403, description: '没有访问权限', type: ApiErrorDto })
@ApiResponse({
  status: 503,
  description: '服务暂时不可用或投递积压达到受理上限',
  type: ApiErrorDto,
})
@Controller('api/v1')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Post('notifications')
  @HttpCode(202)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '受理通知（默认需要 Bearer API Key；系统关闭鉴权后允许匿名发送）',
  })
  @ApiBody({
    type: NotificationDto,
    examples: {
      text: {
        summary: '文本消息（从渠道列表复制渠道 ID）',
        value: {
          target: { type: 'targets', ids: ['ch_a7c92e4f6b18'] },
          message: { text: '订单支付成功。' },
          expires_in: 3600,
        },
      },
      deduplicated: {
        summary: '可选幂等：重试时复用原键',
        value: {
          idempotency_key: 'order-paid-20261021-001',
          target: { type: 'targets', ids: ['ch_a7c92e4f6b18'] },
          message: { text: '订单支付成功。' },
        },
      },
      template: {
        summary: '主题与模板（先在控制台创建）',
        value: {
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
  @ApiResponse({ status: 429, description: '实例发送频率超限', type: ApiErrorDto })
  async create(@Headers('authorization') auth: string | undefined, @Body() body: NotificationDto) {
    const caller = await this.service.authenticate(auth);
    const { idempotency_key, ...input } = body;
    return this.service.accept(caller.apiKeyId, input, idempotency_key);
  }
  @Get('notifications/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '查询通知及投递概况',
    description: '跟随系统鉴权开关；开启时需要 API Key，关闭后可匿名查询。',
  })
  @ApiResponse({ status: 200, type: NotificationResultDto })
  @ApiResponse({ status: 404, description: '通知不存在', type: ApiErrorDto })
  async get(@Param('id', ParseUUIDPipe) id: string, @Headers('authorization') auth?: string) {
    await this.service.authenticate(auth);
    return this.service.query(id);
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
  @ApiResponse({ status: 404, description: '通知不存在', type: ApiErrorDto })
  async deliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') auth?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.service.authenticate(auth);
    return this.service.queryDeliveries(id, cursor);
  }
  @Get('deliveries/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询单个目标的投递结果' })
  @ApiResponse({ status: 200, type: DeliveryResultDto })
  @ApiResponse({ status: 404, description: '投递不存在', type: ApiErrorDto })
  async delivery(@Param('id', ParseUUIDPipe) id: string, @Headers('authorization') auth?: string) {
    await this.service.authenticate(auth);
    return this.service.queryDelivery(id);
  }
}
