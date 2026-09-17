import { Module } from '@nestjs/common';

import { SyllabifyController } from './syllabify.controller.js';
import { SyllabifyService } from './syllabify.service.js';

@Module({
  controllers: [SyllabifyController],
  providers: [SyllabifyService],
})
export class SyllabifyModule {}
