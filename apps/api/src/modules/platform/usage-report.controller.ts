import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { UsageReportService } from './usage-report.service.js';
import { usageQuery } from './usage-report.schemas.js';
import type { UsageQuery } from './usage-report.schemas.js';

@Controller('platform/organizations/:organizationId/projects/:projectId/usage')
@SessionRoute()
export class UsageReportController {
  constructor(
    @Inject(UsageReportService) private readonly usage: UsageReportService,
  ) {}
  @Get()
  report(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query(new ZodBodyPipe(usageQuery)) query: UsageQuery,
  ) {
    return this.usage.report(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
      query,
    );
  }
}
