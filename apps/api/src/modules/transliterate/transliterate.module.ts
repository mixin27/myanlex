import { Module } from '@nestjs/common';

import { TransliterateController } from './transliterate.controller.js';
import { TransliterateService } from './transliterate.service.js';

@Module({
  controllers: [TransliterateController],
  providers: [TransliterateService],
})
export class TransliterateModule {}
