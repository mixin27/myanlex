import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';
import { UsageReportController } from './usage-report.controller.js';
import { UsageReportService } from './usage-report.service.js';

@Module({
  controllers: [PlatformController, ApiKeysController, UsageReportController],
  providers: [PlatformService, ApiKeysService, UsageReportService],
})
export class PlatformModule {}
