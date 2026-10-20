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
export class CredentialsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) webhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) secret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) appKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) appSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) robotCode?: string;
}
export class ChannelDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty({ enum: ['wecom.group_webhook', 'feishu.group_webhook', 'dingtalk.enterprise_bot'] })
  @IsIn(['wecom.group_webhook', 'feishu.group_webhook', 'dingtalk.enterprise_bot', 'mock'])
  type!: 'wecom.group_webhook' | 'feishu.group_webhook' | 'dingtalk.enterprise_bot' | 'mock';
  @ApiProperty({ type: CredentialsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CredentialsDto)
  credentials!: CredentialsDto;
  @ApiProperty({ default: true }) @IsBoolean() enabled: boolean = true;
  @ApiProperty() @IsString() @Length(1, 80) targetName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) openConversationId?: string;
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
  @ApiProperty({ enum: ['targets', 'topic'] }) @IsIn(['targets', 'topic']) type!:
    'targets' | 'topic';
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) key?: string;
}
export class TextDto {
  @ApiProperty() @IsString() @Length(1, 2000) text!: string;
}
export class TemplateRefDto {
  @ApiProperty() @IsString() @MaxLength(50) key!: string;
}
export class NotificationDto {
  @ApiProperty() @IsString() @Length(1, 100) event!: string;
  @ApiProperty({ type: TargetDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => TargetDto)
  target!: TargetDto;
  @ApiPropertyOptional({ type: TextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TextDto)
  message?: TextDto;
  @ApiPropertyOptional({ type: TemplateRefDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateRefDto)
  template?: TemplateRefDto;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
  @ApiPropertyOptional({ default: 3600 })
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
