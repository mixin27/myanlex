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
import { Inject, Injectable } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../../common/tokens.js';

@Injectable()
export class TextService {
  constructor(
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
  ) {}

  detect(request: TextRequest): MyanmarEncodingDetectionResult {
    return this.application.detectText(request);
  }

  normalize(request: TextRequest): NormalizationResult {
    return this.application.normalizeText(request);
  }

  convert(request: ConvertTextRequest): MyanmarEncodingConversionResult {
    return this.application.convertText(request);
  }
}
