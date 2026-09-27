import { Module } from '@nestjs/common';
import { MetricsModule } from '../operations/metrics.module.js';
import { PlaygroundController } from './playground.controller.js';
import { PlaygroundService } from './playground.service.js';

@Module({
  imports: [MetricsModule],
  controllers: [PlaygroundController],
  providers: [PlaygroundService],
})
export class PlaygroundModule {}
