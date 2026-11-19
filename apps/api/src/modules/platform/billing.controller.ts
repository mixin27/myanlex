import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { BillingService } from './billing.service.js';

@Controller('platform/organizations/:organizationId/billing')
@SessionRoute()
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get()
  overview(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.billing.overview(
      request.accountPrincipal!.userId,
      organizationId,
    );
  }
}
