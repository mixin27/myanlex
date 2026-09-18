import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { UsageInterceptor } from './usage.interceptor.js';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: UsageInterceptor }],
})
export class UsageModule {}
