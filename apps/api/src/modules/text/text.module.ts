import { Module } from '@nestjs/common';

import { TextController } from './text.controller.js';
import { TextService } from './text.service.js';

@Module({
  controllers: [TextController],
  providers: [TextService],
})
export class TextModule {}
