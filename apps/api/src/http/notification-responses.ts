import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const deliveryStatuses = [
  'pending',
  'sending',
  'retry_wait',
  'accepted',
  'failed',
  'unknown',
  'expired',
  'cancelled',
];
export class AcceptedNotificationDto {
  @ApiProperty({ format: 'uuid' }) notification_id!: string;
  @ApiProperty({ enum: ['accepted_for_processing'] }) status!: string;
  @ApiProperty() delivery_count!: number;
  @ApiProperty() idempotency_hit!: boolean;
}
export class DeliveryErrorDto {
  @ApiProperty({ example: 'DELIVERY_FAILED', description: 'MsgDock 归一化的投递原因码' })
  code!: string;
  @ApiProperty({ example: '平台业务校验未通过，请检查凭证、权限或消息规则' }) message!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '插件/平台原始原因码；不同插件取值可能不同',
  })
  source_code!: string | null;
}
export class DeliverySummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: deliveryStatuses,
    description: 'accepted 表示平台接受；unknown 表示结果不明，重发前请人工核实',
  })
  status!: string;
  @ApiProperty() targetName!: string;
  @ApiProperty() attemptCount!: number;
  @ApiProperty({
    type: DeliveryErrorDto,
    nullable: true,
    description: '投递业务结果；正常、取消状态为 null。与外层接口 code 独立。',
  })
  error!: DeliveryErrorDto | null;
}
export class NotificationResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: [DeliverySummaryDto] }) deliveries!: DeliverySummaryDto[];
}
export class DeliveryListItemDto extends DeliverySummaryDto {
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class DeliveryResultDto extends DeliveryListItemDto {
  @ApiProperty({ format: 'uuid' }) notificationId!: string;
}
export class DeliveryPageDto {
  @ApiProperty({ type: [DeliveryListItemDto] }) items!: DeliveryListItemDto[];
  @ApiProperty({ type: String, nullable: true, description: '下一页 cursor；null 表示没有后续页' })
  nextCursor!: string | null;
}
export class ApiErrorDto {
  @ApiProperty({ example: 'TARGET_NOT_AUTHORIZED' }) code!: string;
  @ApiProperty({ example: '应用无权访问目标' }) message!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    nullable: true,
    enum: [null],
    example: null,
  })
  data!: null;
  @ApiProperty() request_id!: string;
  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      required: ['field', 'message'],
      properties: { field: { type: 'string' }, message: { type: 'string' } },
    },
    description: '参数校验错误的字段明细，不包含请求值或凭证',
  })
  details?: { field: string; message: string }[];
}
