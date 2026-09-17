import { Module } from '@nestjs/common';

import { OrthographyController } from './orthography.controller.js';
import { OrthographyService } from './orthography.service.js';

@Module({
  controllers: [OrthographyController],
  providers: [OrthographyService],
})
export class OrthographyModule {}
