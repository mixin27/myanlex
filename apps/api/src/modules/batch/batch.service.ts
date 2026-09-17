import type {
  BatchResult,
  BatchSyllabifyRequest,
  BatchTransliterateRequest,
  MyanLexApplication,
  SyllabificationResult,
} from '@myanlex/application';
import type { MyanmarTransliterationResult } from '@myanlex/types';
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class BatchService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  syllabify(
    request: BatchSyllabifyRequest,
  ): BatchResult<SyllabificationResult> {
    return this.application.batchSyllabify(request);
  }

  transliterate(
    request: BatchTransliterateRequest,
  ): BatchResult<MyanmarTransliterationResult> {
    return this.application.batchTransliterate(request);
  }
}
