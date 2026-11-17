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
  Req,
} from '@nestjs/common';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { RolesService } from './roles.service.js';
import { roleInput, roleUpdateInput } from './team.schemas.js';
import type { RoleInput, RoleUpdateInput } from './team.schemas.js';

@Controller('platform/organizations/:organizationId')
@SessionRoute()
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @Get('permissions')
  permissions(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.roles.permissions(
      request.accountPrincipal!.userId,
      organizationId,
    );
  }

  @Get('roles')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.roles.list(request.accountPrincipal!.userId, organizationId);
  }

  @Post('roles')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(roleInput)) body: RoleInput,
  ) {
    return this.roles.create(
      request.accountPrincipal!.userId,
      organizationId,
      body,
    );
  }

  @Patch('roles/:roleId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body(new ZodBodyPipe(roleUpdateInput)) body: RoleUpdateInput,
  ) {
    return this.roles.update(
      request.accountPrincipal!.userId,
      organizationId,
      roleId,
      body,
    );
  }

  @Delete('roles/:roleId')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
  ): Promise<void> {
    await this.roles.remove(
      request.accountPrincipal!.userId,
      organizationId,
      roleId,
    );
  }
}
