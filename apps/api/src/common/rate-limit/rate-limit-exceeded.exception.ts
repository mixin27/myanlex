import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      'The API key has exceeded its request allowance.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
