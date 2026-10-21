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
  @ApiProperty() request_id!: string;
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
  @ApiPropertyOptional({ type: String, nullable: true }) lastCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastMessage!: string | null;
}
export class NotificationResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() event!: string;
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
  @ApiProperty({ example: 'HTTP_401' }) code!: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];
  @ApiProperty() request_id!: string;
}
