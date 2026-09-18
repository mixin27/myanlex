import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountAuthService } from './account-auth.service.js';

@Module({
  imports: [ConfigModule],
  providers: [AccountAuthService],
  exports: [AccountAuthService],
})
export class AccountAuthModule {}
