import type {
  ConvertTextRequest,
  MyanLexApplication,
  TextRequest,
} from '@myanlex/application';
import type {
  MyanmarEncodingConversionResult,
  MyanmarEncodingDetectionResult,
  NormalizationResult,
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
  convertTextRequestSchema,
  textRequestSchema,
} from '../http/request-schemas.js';
import { ZodBodyPipe } from '../http/zod-body.pipe.js';

@Controller('text')
export class TextController {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  @Post('detect')
  @HttpCode(HttpStatus.OK)
  detectText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): MyanmarEncodingDetectionResult {
    return this.application.detectText(request);
  }

  @Post('normalize')
  @HttpCode(HttpStatus.OK)
  normalizeText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): NormalizationResult {
    return this.application.normalizeText(request);
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  convertText(
    @Body(new ZodBodyPipe(convertTextRequestSchema))
    request: ConvertTextRequest,
  ): MyanmarEncodingConversionResult {
    return this.application.convertText(request);
  }
}
