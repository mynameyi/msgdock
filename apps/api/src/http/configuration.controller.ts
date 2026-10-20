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
import { ApplicationDto, ChannelDto, TemplateDto, TopicDto } from './dto';
import { AdminRequest, SessionGuard } from './security';
@ApiTags('配置')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('api/admin')
export class ConfigurationController {
  constructor(private readonly service: ConfigurationService) {}
  @Get('applications') applications() {
    return this.service.applications();
  }
  @Post('applications') createApplication(@Body() body: ApplicationDto, @Req() req: AdminRequest) {
    return this.service.saveApplication(body, req.admin.username);
  }
  @Put('applications/:id') updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplicationDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveApplication(body, req.admin.username, id);
  }
  @Post('applications/:id/keys') createKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AdminRequest,
  ) {
    return this.service.createKey(id, req.admin.username);
  }
  @Post('applications/:id/keys/:keyId/revoke') revokeKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @Req() req: AdminRequest,
  ) {
    return this.service.revokeKey(id, keyId, req.admin.username);
  }
  @Get('channels') channels() {
    return this.service.channels();
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
