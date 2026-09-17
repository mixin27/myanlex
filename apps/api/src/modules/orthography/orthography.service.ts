import type { MyanLexApplication, TextRequest } from '@myanlex/application';
import type { BurmeseOrthographyValidationResult } from '@myanlex/types';
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class OrthographyService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  validate(request: TextRequest): BurmeseOrthographyValidationResult {
    return this.application.validateOrthography(request);
  }
}
