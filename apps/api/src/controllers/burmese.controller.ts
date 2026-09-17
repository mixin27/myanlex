import type { MyanLexApplication, TextRequest } from '@myanlex/application';
import type { SyllabificationResult } from '@myanlex/application';
import type { BurmeseOrthographyValidationResult } from '@myanlex/types';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../api.tokens.js';
import { textRequestSchema } from '../http/request-schemas.js';
import { ZodBodyPipe } from '../http/zod-body.pipe.js';

@Controller()
export class BurmeseController {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  @Post('syllabify')
  @HttpCode(HttpStatus.OK)
  syllabifyText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): SyllabificationResult {
    return this.application.syllabifyText(request);
  }

  @Post('orthography/validate')
  @HttpCode(HttpStatus.OK)
  validateOrthography(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): BurmeseOrthographyValidationResult {
    return this.application.validateOrthography(request);
  }
}
