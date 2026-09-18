import type { TransliterateTextRequest } from '@myanlex/application';
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
import { transliterateTextRequestSchema } from './dto/transliterate-text-request.schema.js';
import { TransliterateService } from './transliterate.service.js';

@Controller('transliterate')
@RequirePermissions('api.invoke')
export class TransliterateController {
  constructor(
    @Inject(TransliterateService)
    private readonly transliterateService: TransliterateService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  transliterateText(
    @Body(new ZodBodyPipe(transliterateTextRequestSchema))
    request: TransliterateTextRequest,
  ): MyanmarTransliterationResult {
    return this.transliterateService.execute(request);
  }
}
