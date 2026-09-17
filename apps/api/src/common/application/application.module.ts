import { createMyanLexApplication } from '@myanlex/application';
import { Global, Module } from '@nestjs/common';

import { MYANLEX_APPLICATION } from '../tokens.js';

@Global()
@Module({
  providers: [
    { provide: MYANLEX_APPLICATION, useValue: createMyanLexApplication() },
  ],
  exports: [MYANLEX_APPLICATION],
})
export class ApplicationModule {}
