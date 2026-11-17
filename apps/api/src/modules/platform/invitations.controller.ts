import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { InvitationsService } from './invitations.service.js';
import { listQuery } from './platform.schemas.js';
import type { ListQuery } from './platform.schemas.js';
import { invitationAcceptInput, invitationInput } from './team.schemas.js';
import type { InvitationAcceptInput, InvitationInput } from './team.schemas.js';

@Controller('platform/organizations/:organizationId/invitations')
@SessionRoute()
export class OrganizationInvitationsController {
  constructor(
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(listQuery)) query: ListQuery,
  ) {
    return this.invitations.list(
      request.accountPrincipal!.userId,
      organizationId,
      query,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(invitationInput)) body: InvitationInput,
  ) {
    return this.invitations.create(
      request.accountPrincipal!.userId,
      organizationId,
      body,
    );
  }

  @Post(':invitationId/resend')
  @HttpCode(200)
  resend(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.resend(
      request.accountPrincipal!.userId,
      organizationId,
      invitationId,
    );
  }

  @Post(':invitationId/revoke')
  @HttpCode(200)
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.revoke(
      request.accountPrincipal!.userId,
      organizationId,
      invitationId,
    );
  }
}

/** Invitations addressed to the signed-in account's verified email. */
@Controller('platform/invitations')
@SessionRoute()
export class AccountInvitationsController {
  constructor(
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  pending(@Req() request: AuthenticatedRequest) {
    return this.invitations.pending(request.accountPrincipal!.email);
  }

  @Post('accept')
  @HttpCode(200)
  accept(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodBodyPipe(invitationAcceptInput)) body: InvitationAcceptInput,
  ) {
    return this.invitations.accept(
      request.accountPrincipal!.userId,
      request.accountPrincipal!.email,
      body,
    );
  }
}
