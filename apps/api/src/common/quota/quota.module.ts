import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { QuotaGuard } from './quota.guard.js';

@Module({
  providers: [{ provide: APP_GUARD, useClass: QuotaGuard }],
})
export class QuotaModule {}
