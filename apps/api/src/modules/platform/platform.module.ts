import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';
import { UsageReportController } from './usage-report.controller.js';
import { UsageReportService } from './usage-report.service.js';
import { QuotaReportController } from './quota-report.controller.js';
import { QuotaReportService } from './quota-report.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import {
  AccountInvitationsController,
  OrganizationInvitationsController,
} from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { AccountAuthModule } from '../account-auth/account-auth.module.js';

@Module({
  imports: [AccountAuthModule],
  controllers: [
    PlatformController,
    ApiKeysController,
    UsageReportController,
    QuotaReportController,
    MembersController,
    RolesController,
    OrganizationInvitationsController,
    AccountInvitationsController,
  ],
  providers: [
    PlatformService,
    ApiKeysService,
    UsageReportService,
    QuotaReportService,
    MembersService,
    RolesService,
    InvitationsService,
  ],
})
export class PlatformModule {}
