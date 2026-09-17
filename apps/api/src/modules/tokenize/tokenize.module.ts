import { Module } from '@nestjs/common';

import { TokenizeController } from './tokenize.controller.js';
import { TokenizeService } from './tokenize.service.js';

@Module({
  controllers: [TokenizeController],
  providers: [TokenizeService],
})
export class TokenizeModule {}
