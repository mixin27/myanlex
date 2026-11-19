import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { UsageStatementService } from './usage-statement.service.js';
import { statementMonth, statementQuery } from './usage-statement.schemas.js';
import type { StatementQuery } from './usage-statement.schemas.js';

@Controller('platform/organizations/:organizationId/usage-statements')
@SessionRoute()
export class UsageStatementController {
  constructor(
    @Inject(UsageStatementService)
    private readonly statements: UsageStatementService,
  ) {}

  @Get()
  statement(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(statementQuery)) query: StatementQuery,
  ) {
    return this.statements.statement(
      request.accountPrincipal!.userId,
      organizationId,
      query.month,
    );
  }

  @Get(':month/events.csv')
  async events(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('month', new ZodBodyPipe(statementMonth)) month: Date,
  ) {
    const { filename, stream } = await this.statements.eventsCsv(
      request.accountPrincipal!.userId,
      organizationId,
      month,
    );
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
