import type { ConvertTextRequest, TextRequest } from '@myanlex/application';
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

import { RequirePermissions } from '../../common/auth/require-permissions.decorator.js';
import { textRequestSchema } from '../../common/validation/text-request.schema.js';
import { ZodBodyPipe } from '../../common/validation/zod-body.pipe.js';
import { convertTextRequestSchema } from './dto/convert-text-request.schema.js';
import { TextService } from './text.service.js';

@Controller('text')
@RequirePermissions('api.invoke')
export class TextController {
  constructor(@Inject(TextService) private readonly textService: TextService) {}

  @Post('detect')
  @HttpCode(HttpStatus.OK)
  detectText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): MyanmarEncodingDetectionResult {
    return this.textService.detect(request);
  }

  @Post('normalize')
  @HttpCode(HttpStatus.OK)
  normalizeText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): NormalizationResult {
    return this.textService.normalize(request);
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  convertText(
    @Body(new ZodBodyPipe(convertTextRequestSchema))
    request: ConvertTextRequest,
  ): MyanmarEncodingConversionResult {
    return this.textService.convert(request);
  }
}
