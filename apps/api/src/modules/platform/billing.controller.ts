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
import { BillingService } from './billing.service.js';
import { auditActor } from './audit.js';
import {
  invoiceListQuery,
  invoiceNumber,
  planChangeInput,
  type InvoiceListQuery,
  type PlanChangeBody,
} from './billing.schemas.js';

@Controller('platform/organizations/:organizationId/billing')
@SessionRoute()
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get()
  overview(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.billing.overview(
      request.accountPrincipal!.userId,
      organizationId,
    );
  }

  @Get('invoices')
  invoices(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query(new ZodBodyPipe(invoiceListQuery)) query: InvoiceListQuery,
  ) {
    return this.billing.invoices(
      request.accountPrincipal!.userId,
      organizationId,
      query,
    );
  }

  @Get('invoices/:number')
  invoice(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('number', new ZodBodyPipe(invoiceNumber)) number: string,
  ) {
    return this.billing.invoice(
      request.accountPrincipal!.userId,
      organizationId,
      number,
    );
  }

  @Post('plan-changes')
  requestChange(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(planChangeInput)) body: PlanChangeBody,
  ) {
    return this.billing.requestChange(
      auditActor(request),
      organizationId,
      body,
    );
  }

  @Post('plan-changes/:changeId/cancel')
  @HttpCode(200)
  cancelChange(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('changeId', new ParseUUIDPipe()) changeId: string,
  ) {
    return this.billing.cancelChange(
      auditActor(request),
      organizationId,
      changeId,
    );
  }
}
