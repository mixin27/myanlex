import type { MyanLexApplication, TextRequest } from '@myanlex/application';
import type { TextTokenizationResult } from '@myanlex/types';
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class TokenizeService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  execute(request: TextRequest): TextTokenizationResult {
    return this.application.tokenizeText(request);
  }
}
