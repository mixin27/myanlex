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
  Query,
  Req,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { MembersService } from './members.service.js';
import { listQuery } from './platform.schemas.js';
import type { ListQuery } from './platform.schemas.js';
import { memberUpdateInput } from './team.schemas.js';
import type { MemberUpdateInput } from './team.schemas.js';

@Controller('platform/organizations/:organizationId/members')
@SessionRoute()
export class MembersController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(listQuery)) query: ListQuery,
  ) {
    return this.members.list(
      request.accountPrincipal!.userId,
      organizationId,
      query,
    );
  }

  @Patch(':userId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodBodyPipe(memberUpdateInput)) body: MemberUpdateInput,
  ) {
    return this.members.update(
      request.accountPrincipal!.userId,
      organizationId,
      userId,
      body,
    );
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.members.remove(
      request.accountPrincipal!.userId,
      organizationId,
      userId,
    );
  }
}
