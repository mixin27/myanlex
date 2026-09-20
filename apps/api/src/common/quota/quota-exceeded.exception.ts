import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      'The organization has exhausted its monthly API allowance.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
