import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  controllers: [PlatformController, ApiKeysController],
  providers: [PlatformService, ApiKeysService],
})
export class PlatformModule {}
