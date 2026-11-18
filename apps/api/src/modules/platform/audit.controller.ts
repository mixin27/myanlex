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
import { AuditService } from './audit.service.js';
import { auditQuery } from './audit.schemas.js';
import type { AuditQueryInput } from './audit.schemas.js';

@Controller('platform/organizations/:organizationId/audit-events')
@SessionRoute()
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(auditQuery)) query: AuditQueryInput,
  ) {
    return this.audit.list(
      request.accountPrincipal!.userId,
      organizationId,
      query,
    );
  }
}
