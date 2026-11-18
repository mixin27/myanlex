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
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { auditActor } from './audit.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { MembersService } from './members.service.js';
import { listQuery } from './platform.schemas.js';
import type { ListQuery } from './platform.schemas.js';
import { memberUpdateInput, ownershipTransferInput } from './team.schemas.js';
import type {
  MemberUpdateInput,
  OwnershipTransferInput,
} from './team.schemas.js';
import { OwnershipService } from './ownership.service.js';

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
      auditActor(request),
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
    await this.members.remove(auditActor(request), organizationId, userId);
  }
}

@Controller('platform/organizations/:organizationId/ownership-transfer')
@SessionRoute()
export class OwnershipController {
  constructor(
    @Inject(OwnershipService) private readonly ownership: OwnershipService,
  ) {}

  @Post()
  @HttpCode(200)
  transfer(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(ownershipTransferInput)) body: OwnershipTransferInput,
  ) {
    return this.ownership.transfer(auditActor(request), organizationId, body);
  }
}
