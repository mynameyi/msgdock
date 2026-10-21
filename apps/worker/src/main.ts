import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DeliveryWorkerModule, InfrastructureModule } from '@msgdock/server';
@Module({ imports: [InfrastructureModule, DeliveryWorkerModule] })
class WorkerAppModule {}
async function main() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  app.enableShutdownHooks();
}
void main().catch(() => {
  console.error('Worker 启动失败，请检查配置与数据服务');
  process.exit(1);
});
