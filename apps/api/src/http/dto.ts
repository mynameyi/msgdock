import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class LoginDto {
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9_.-]{3,40}$/) username!: string;
  @ApiProperty({ format: 'password' }) @IsString() @Length(12, 128) password!: string;
}
export class SetupDto extends LoginDto {
  @ApiProperty() @IsString() @Length(20, 200) setupToken!: string;
}
export class PasswordDto {
  @ApiProperty({ format: 'password' }) @IsString() @Length(12, 128) oldPassword!: string;
  @ApiProperty({ format: 'password' }) @IsString() @Length(12, 128) newPassword!: string;
}
export class ApplicationDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9-]{2,49}$/) key!: string;
  @ApiProperty({ enum: ['api_key', 'none'], default: 'api_key' })
  @IsIn(['api_key', 'none'])
  authMode: 'api_key' | 'none' = 'api_key';
  @ApiProperty({ default: true }) @IsBoolean() enabled: boolean = true;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  allowedTargetIds: string[] = [];
  @ApiProperty({ default: 60 }) @IsInt() @Min(1) @Max(10000) perMinuteLimit: number = 60;
}
export class ChannelDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty({ description: '已注册渠道插件的稳定 ID，通过 channel-plugins 查询' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{1,99}$/)
  type!: string;
  @ApiPropertyOptional({ description: '新渠道默认使用当前插件版本；已有渠道不可直接切换' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  pluginVersion?: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '按插件 configSchema 校验；整体加密保存，永不回传',
  })
  @IsObject()
  credentials!: Record<string, unknown>;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: '按插件 targetSchema 校验',
  })
  @IsOptional()
  @IsObject()
  targetConfig?: Record<string, unknown>;
  @ApiProperty({ default: true }) @IsBoolean() enabled: boolean = true;
  @ApiProperty() @IsString() @Length(1, 80) targetName!: string;
  @ApiPropertyOptional({
    deprecated: true,
    description: '0.1.0 兼容字段；新客户端使用 targetConfig',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  openConversationId?: string;
}
export class TopicDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_-]{1,49}$/) key!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  targetIds!: string[];
}
export class TemplateDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_-]{1,49}$/) key!: string;
  @ApiProperty() @IsString() @Length(1, 5000) body!: string;
}
export class TargetDto {
  @ApiProperty({
    enum: ['targets', 'topic'],
    example: 'targets',
    description: 'targets 使用 ids；topic 使用 key。所有目标需在应用授权范围内。',
  })
  @IsIn(['targets', 'topic'])
  type!: 'targets' | 'topic';
  @ApiPropertyOptional({
    type: [String],
    example: ['00000000-0000-4000-8000-000000000001'],
    description: 'type=targets 时填写实际目标 UUID，最多 500 个',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids?: string[];
  @ApiPropertyOptional({ example: 'finance', description: 'type=topic 时填写主题 Key' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;
}
export class TextDto {
  @ApiProperty({
    example: '订单支付成功。',
    description: '非空文本，最终 UTF-8 内容最多 2000 字节，且不能超过渠道插件上限',
  })
  @IsString()
  @Length(1, 2000)
  text!: string;
}
export class TemplateRefDto {
  @ApiProperty() @IsString() @MaxLength(50) key!: string;
}
export class NotificationDto {
  @ApiProperty({ example: 'order.paid', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  event!: string;
  @ApiProperty({ type: TargetDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => TargetDto)
  target!: TargetDto;
  @ApiPropertyOptional({
    type: TextDto,
    description: '直接文本消息；message 与 template 必须且只能提供一个',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TextDto)
  message?: TextDto;
  @ApiPropertyOptional({
    type: TemplateRefDto,
    description: '引用控制台创建的模板；提供 template 时省略 message',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateRefDto)
  template?: TemplateRefDto;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
  @ApiPropertyOptional({
    default: 3600,
    minimum: 1,
    maximum: 604800,
    description: '有效期，单位秒',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(604800)
  expires_in?: number;
}
export class TestSendDto {
  @ApiProperty() @IsUUID('4') applicationId!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  targetIds!: string[];
  @ApiProperty() @IsString() @Length(1, 2000) text!: string;
}
export class ReplayDto {
  @ApiProperty() @IsString() @Length(3, 300) reason!: string;
  @ApiProperty({ default: false }) @IsBoolean() confirmed: boolean = false;
}
