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
import { QuotaReportService } from './quota-report.service.js';

@Controller('platform/organizations/:organizationId/quota')
@SessionRoute()
export class QuotaReportController {
  constructor(
    @Inject(QuotaReportService) private readonly quotas: QuotaReportService,
  ) {}
  @Get()
  report(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.quotas.report(request.accountPrincipal!.userId, organizationId);
  }
}
