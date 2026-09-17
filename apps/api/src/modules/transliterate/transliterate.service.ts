import type {
  MyanLexApplication,
  TransliterateTextRequest,
} from '@myanlex/application';
import type { MyanmarTransliterationResult } from '@myanlex/types';
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class TransliterateService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  execute(request: TransliterateTextRequest): MyanmarTransliterationResult {
    return this.application.transliterateText(request);
  }
}
