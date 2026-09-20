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
import { ApiKeysService } from './api-keys.service.js';
import { apiKeyInput } from './api-key.schemas.js';
import type { ApiKeyInput } from './api-key.schemas.js';
import { listQuery } from './platform.schemas.js';
import type { ListQuery } from './platform.schemas.js';

@Controller(
  'platform/organizations/:organizationId/projects/:projectId/api-keys',
)
@SessionRoute()
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly keys: ApiKeysService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query(new ZodBodyPipe(listQuery)) query: ListQuery,
  ) {
    return this.keys.list(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
      query,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodBodyPipe(apiKeyInput)) body: ApiKeyInput,
  ) {
    return this.keys.create(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
      body,
    );
  }

  @Post(':keyId/revoke')
  @HttpCode(200)
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('keyId', new ParseUUIDPipe()) keyId: string,
  ) {
    return this.keys.revoke(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
      keyId,
    );
  }
}
