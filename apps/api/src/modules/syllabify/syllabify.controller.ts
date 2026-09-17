import type { SyllabificationResult, TextRequest } from '@myanlex/application';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';

import { textRequestSchema } from '../../common/validation/text-request.schema.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { SyllabifyService } from './syllabify.service.js';

@Controller('syllabify')
export class SyllabifyController {
  constructor(
    @Inject(SyllabifyService)
    private readonly syllabifyService: SyllabifyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  syllabifyText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): SyllabificationResult {
    return this.syllabifyService.execute(request);
  }
}
