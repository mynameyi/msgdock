import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ConfigurationService } from '@msgdock/server';
import { ApiKeyDto, ApiSettingsDto, ChannelDto, TemplateDto, TopicDto } from './dto';
import { AdminRequest, SessionGuard } from './security';
@ApiTags('配置')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('api/admin')
export class ConfigurationController {
  constructor(private readonly service: ConfigurationService) {}
  @Get('api-keys') apiKeys() {
    return this.service.apiKeys();
  }
  @Post('api-keys') createKey(@Body() body: ApiKeyDto, @Req() req: AdminRequest) {
    return this.service.createKey(body, req.admin.username);
  }
  @Put('api-keys/:id') updateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApiKeyDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.updateKey(id, body, req.admin.username);
  }
  @Post('api-keys/:id/revoke') revokeKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AdminRequest,
  ) {
    return this.service.revokeKey(id, req.admin.username);
  }
  @Get('api-settings') apiSettings() {
    return this.service.apiSettings();
  }
  @Put('api-settings') saveApiSettings(@Body() body: ApiSettingsDto, @Req() req: AdminRequest) {
    return this.service.saveApiSettings(body, req.admin.username);
  }
  @Get('channels') channels() {
    return this.service.channels();
  }
  @Get('channel-plugins') plugins() {
    return this.service.plugins();
  }
  @Post('channels') createChannel(@Body() body: ChannelDto, @Req() req: AdminRequest) {
    return this.service.saveChannel(body, req.admin.username);
  }
  @Put('channels/:id') updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChannelDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveChannel(body, req.admin.username, id);
  }
  @Get('targets') targets() {
    return this.service.targets();
  }
  @Get('topics') topics() {
    return this.service.topics();
  }
  @Post('topics') createTopic(@Body() body: TopicDto, @Req() req: AdminRequest) {
    return this.service.saveTopic(body, req.admin.username);
  }
  @Put('topics/:id') updateTopic(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TopicDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveTopic(body, req.admin.username, id);
  }
  @Get('templates') templates() {
    return this.service.templates();
  }
  @Post('templates') createTemplate(@Body() body: TemplateDto, @Req() req: AdminRequest) {
    return this.service.saveTemplate(body, req.admin.username);
  }
  @Put('templates/:id') updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TemplateDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveTemplate(body, req.admin.username, id);
  }
  @Get('audit') audit() {
    return this.service.audit();
  }
}
