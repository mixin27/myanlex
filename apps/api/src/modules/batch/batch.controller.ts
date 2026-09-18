import type {
  BatchResult,
  BatchSyllabifyRequest,
  BatchTransliterateRequest,
  SyllabificationResult,
} from '@myanlex/application';
import type { MyanmarTransliterationResult } from '@myanlex/types';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';

import { RequirePermissions } from '../../common/auth/require-permissions.decorator.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { BatchService } from './batch.service.js';
import {
  batchSyllabifyRequestSchema,
  batchTransliterateRequestSchema,
} from './dto/batch-request.schema.js';

@Controller('batch')
@RequirePermissions('api.invoke')
export class BatchController {
  constructor(
    @Inject(BatchService) private readonly batchService: BatchService,
  ) {}

  @Post('syllabify')
  @HttpCode(HttpStatus.OK)
  syllabify(
    @Body(new ZodBodyPipe(batchSyllabifyRequestSchema))
    request: BatchSyllabifyRequest,
  ): BatchResult<SyllabificationResult> {
    return this.batchService.syllabify(request);
  }

  @Post('transliterate')
  @HttpCode(HttpStatus.OK)
  transliterate(
    @Body(new ZodBodyPipe(batchTransliterateRequestSchema))
    request: BatchTransliterateRequest,
  ): BatchResult<MyanmarTransliterationResult> {
    return this.batchService.transliterate(request);
  }
}
