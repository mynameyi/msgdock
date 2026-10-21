import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { channelIdPattern } from '@msgdock/contracts';
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
  ValidateIf,
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
export class ApiKeyDto {
  @ApiProperty() @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
  @ApiProperty({ default: true }) @IsBoolean() enabled: boolean = true;
}
export class ApiSettingsDto {
  @ApiProperty({ default: true }) @IsBoolean() authEnabled: boolean = true;
  @ApiProperty({ default: 60 }) @IsInt() @Min(1) @Max(10000) perMinuteLimit: number = 60;
}
export class ChannelDto {
  @ApiProperty({ description: '渠道名称，同时作为接收目标的显示名称', example: '财务通知群' })
  @IsString()
  @Length(1, 80)
  name!: string;
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
  @ApiPropertyOptional({
    deprecated: true,
    description: '仅兼容旧客户端；此字段不再生效，接收目标名称统一使用 name',
  })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  targetName?: string;
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
    description: 'targets 使用 ids；topic 使用 key。目标必须对应已启用的渠道。',
  })
  @IsIn(['targets', 'topic'])
  type!: 'targets' | 'topic';
  @ApiPropertyOptional({
    type: [String],
    example: ['ch_a7c92e4f6b18'],
    maxItems: 500,
    items: { type: 'string', pattern: channelIdPattern.source },
    description:
      'type=targets 时仅接受渠道 ID（ch_ 加 12 位小写十六进制字符），可从渠道列表复制。最多 500 个，重复 ID 去重。',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(channelIdPattern, { each: true })
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
  @ApiPropertyOptional({
    description:
      '可选的业务通知标识，在同一 API Key 下去重；匿名请求共用匿名范围。省略时每次请求创建新通知；提供时同一请求重试复用原值。',
    example: 'order-paid-20261021-001',
    minLength: 1,
    maxLength: 200,
    pattern: '^[\\x21-\\x7E]{1,200}$',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[\x21-\x7E]{1,200}$/)
  idempotency_key?: string;
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
  @ApiProperty({
    type: [String],
    description: '渠道列表中的渠道短 ID',
    items: { type: 'string', pattern: channelIdPattern.source },
  })
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(channelIdPattern, { each: true })
  targetIds!: string[];
  @ApiProperty() @IsString() @Length(1, 2000) text!: string;
}
export class ReplayDto {
  @ApiProperty() @IsString() @Length(3, 300) reason!: string;
  @ApiProperty({ default: false }) @IsBoolean() confirmed: boolean = false;
}
