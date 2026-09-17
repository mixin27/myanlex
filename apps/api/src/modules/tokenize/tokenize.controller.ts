import type { TextRequest } from '@myanlex/application';
import type { TextTokenizationResult } from '@myanlex/types';
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
import { TokenizeService } from './tokenize.service.js';

@Controller('tokenize')
export class TokenizeController {
  constructor(
    @Inject(TokenizeService)
    private readonly tokenizeService: TokenizeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  tokenizeText(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): TextTokenizationResult {
    return this.tokenizeService.execute(request);
  }
}
