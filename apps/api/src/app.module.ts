import { Module } from '@nestjs/common';
import {
  ConfigurationModule,
  DeliveriesModule,
  IdentityModule,
  InfrastructureModule,
  NotificationsModule,
} from '@msgdock/server';
import { IdentityController } from './http/identity.controller';
import { ConfigurationController } from './http/configuration.controller';
import { DeliveriesController } from './http/deliveries.controller';
import { NotificationsController } from './http/notifications.controller';
import { SessionGuard } from './http/security';
@Module({
  imports: [
    InfrastructureModule,
    IdentityModule,
    ConfigurationModule,
    DeliveriesModule,
    NotificationsModule,
  ],
  controllers: [
    IdentityController,
    ConfigurationController,
    DeliveriesController,
    NotificationsController,
  ],
  providers: [SessionGuard],
})
export class AppModule {}
