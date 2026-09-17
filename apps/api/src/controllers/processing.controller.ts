import type {
  MyanLexApplication,
  TextRequest,
  TransliterateTextRequest,
} from '@myanlex/application';
import type {
  MyanmarTransliterationResult,
  TextTokenizationResult,
} from '@myanlex/types';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../api.tokens.js';
import {
  textRequestSchema,
  transliterateTextRequestSchema,
} from '../http/request-schemas.js';
import { ZodBodyPipe } from '../http/zod-body.pipe.js';

@Controller()
export class ProcessingController {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  @Post('transliterate')
  @HttpCode(HttpStatus.OK)
  transliterateText(
    @Body(new ZodBodyPipe(transliterateTextRequestSchema))
    request: TransliterateTextRequest,
  ): MyanmarTransliterationResult {
    return this.application.transliterateText(request);
  }

  @Post('tokenize')
  @HttpCode(HttpStatus.OK)
  tokenizeText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): TextTokenizationResult {
    return this.application.tokenizeText(request);
  }
}
