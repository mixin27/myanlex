import type { TextRequest } from '@myanlex/application';
import type { BurmeseOrthographyValidationResult } from '@myanlex/types';
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
import { OrthographyService } from './orthography.service.js';

@Controller('orthography')
export class OrthographyController {
  constructor(
    @Inject(OrthographyService)
    private readonly orthographyService: OrthographyService,
  ) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validateOrthography(
    @Body(new ZodBodyPipe(textRequestSchema)) request: TextRequest,
  ): BurmeseOrthographyValidationResult {
    return this.orthographyService.validate(request);
  }
}
