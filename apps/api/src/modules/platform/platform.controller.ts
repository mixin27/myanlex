import {
  Body,
  Controller,
  Get,
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
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { PlatformService } from './platform.service.js';
import {
  listQuery,
  organizationInput,
  projectInput,
  projectUpdateInput,
} from './platform.schemas.js';
import type {
  ListQuery,
  OrganizationInput,
  ProjectInput,
  ProjectUpdateInput,
} from './platform.schemas.js';

@Controller('platform/organizations')
@SessionRoute()
export class PlatformController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodBodyPipe(listQuery)) query: ListQuery,
  ) {
    return this.platform.listOrganizations(
      request.accountPrincipal!.userId,
      query,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodBodyPipe(organizationInput)) body: OrganizationInput,
  ) {
    return this.platform.createOrganization(
      request.accountPrincipal!.userId,
      body,
    );
  }

  @Get(':organizationId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.platform.getOrganization(
      request.accountPrincipal!.userId,
      organizationId,
    );
  }

  @Get(':organizationId/projects')
  projects(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(listQuery)) query: ListQuery,
  ) {
    return this.platform.listProjects(
      request.accountPrincipal!.userId,
      organizationId,
      query,
    );
  }

  @Post(':organizationId/projects')
  createProject(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(projectInput)) body: ProjectInput,
  ) {
    return this.platform.createProject(
      request.accountPrincipal!.userId,
      organizationId,
      body,
    );
  }

  @Patch(':organizationId/projects/:projectId')
  updateProject(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodBodyPipe(projectUpdateInput)) body: ProjectUpdateInput,
  ) {
    return this.platform.updateProject(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
      body,
    );
  }

  @Get(':organizationId/projects/:projectId')
  getProject(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.platform.getProject(
      request.accountPrincipal!.userId,
      organizationId,
      projectId,
    );
  }
}
