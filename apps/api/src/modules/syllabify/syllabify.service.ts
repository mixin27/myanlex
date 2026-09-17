import type {
  MyanLexApplication,
  SyllabificationResult,
  TextRequest,
} from '@myanlex/application';
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class SyllabifyService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  execute(request: TextRequest): SyllabificationResult {
    return this.application.syllabifyText(request);
  }
}
