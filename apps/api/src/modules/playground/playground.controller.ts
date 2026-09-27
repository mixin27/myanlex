import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { DEFER_RATE_LIMIT } from '../../common/rate-limit/rate-limit.guard.js';
import { PlaygroundService } from './playground.service.js';

@Controller(
  'platform/organizations/:organizationId/projects/:projectId/playground',
)
@SessionRoute()
export class PlaygroundController {
  constructor(
    @Inject(PlaygroundService) private readonly service: PlaygroundService,
  ) {}
  @Post('execute')
  @HttpCode(200)
  @SetMetadata(DEFER_RATE_LIMIT, true)
  execute(
    @Req() request: AuthenticatedRequest & { id: string },
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Body() body: unknown,
    @Res({ passthrough: true })
    reply: { header(name: string, value: number): void },
  ) {
    return this.service.execute(
      request.accountPrincipal!.userId,
      org,
      project,
      body,
      request.id,
      (name, value) => reply.header(name, value),
    );
  }
  @Post('runs')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Body() body: unknown,
  ) {
    return this.service.save(
      request.accountPrincipal!.userId,
      org,
      project,
      body,
    );
  }
  @Get('runs')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Query() query: unknown,
  ) {
    return this.service.list(
      request.accountPrincipal!.userId,
      org,
      project,
      query,
    );
  }
  @Get('runs/:id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get(request.accountPrincipal!.userId, org, project, id);
  }
  @Patch('runs/:id')
  rename(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.service.rename(
      request.accountPrincipal!.userId,
      org,
      project,
      id,
      body,
    );
  }
  @Delete('runs/:id')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) org: string,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.delete(
      request.accountPrincipal!.userId,
      org,
      project,
      id,
    );
  }
}
