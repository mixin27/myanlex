import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator.js';
import { SessionRoute } from '../../common/auth/session-route.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { BillingService } from './billing.service.js';
import { auditActor } from './audit.js';
import {
  billingDetailsInput,
  billingEmailConfirmInput,
  billingEmailInput,
  type BillingDetailsBody,
  type BillingEmailBody,
  type BillingEmailConfirmBody,
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

  @Put('profile')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(billingDetailsInput)) body: BillingDetailsBody,
  ) {
    return this.billing.updateDetails(
      auditActor(request),
      organizationId,
      body,
    );
  }

  @Post('emails')
  addEmail(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodBodyPipe(billingEmailInput)) body: BillingEmailBody,
  ) {
    return this.billing.addEmail(
      auditActor(request),
      organizationId,
      body.email,
    );
  }

  @Post('emails/:emailId/resend')
  @HttpCode(200)
  resendEmail(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('emailId', new ParseUUIDPipe()) emailId: string,
  ) {
    return this.billing.resendEmail(
      auditActor(request),
      organizationId,
      emailId,
    );
  }

  @Delete('emails/:emailId')
  @HttpCode(204)
  async removeEmail(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('emailId', new ParseUUIDPipe()) emailId: string,
  ): Promise<void> {
    await this.billing.removeEmail(
      auditActor(request),
      organizationId,
      emailId,
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

/**
 * Confirms a billing email from the link in its confirmation mail. Public:
 * the mailbox holder may not have a MyanLex account. POST only, so link
 * scanners that fetch the URL do not confirm addresses.
 */
@Controller('platform/billing-emails')
@Public()
export class BillingEmailConfirmationController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Post('confirm')
  @HttpCode(200)
  confirm(
    @Body(new ZodBodyPipe(billingEmailConfirmInput))
    body: BillingEmailConfirmBody,
  ) {
    return this.billing.confirmEmail(body.token);
  }
}
