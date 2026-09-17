import { ApplicationInputError } from '@myanlex/application';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface HttpRequest {
  readonly id: string;
  readonly url: string;
}

interface HttpReply {
  status(code: number): HttpReply;
  type(contentType: string): HttpReply;
  send(body: unknown): void;
}

interface ProblemDetails {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
}

function titleForStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'Bad Request';
  if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) return 'Payload Too Large';
  if (status === HttpStatus.NOT_FOUND) return 'Not Found';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'Too Many Requests';
  return 'Internal Server Error';
}

function getTransportStatus(exception: unknown): number | undefined {
  if (
    typeof exception !== 'object' ||
    exception === null ||
    !('statusCode' in exception) ||
    typeof exception.statusCode !== 'number'
  ) {
    return undefined;
  }

  const { statusCode } = exception;
  return statusCode >= 400 && statusCode <= 599 ? statusCode : undefined;
}

@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const reply = context.getResponse<HttpReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let detail = 'An unexpected service error occurred.';

    if (exception instanceof ApplicationInputError) {
      status =
        exception.code === 'text_too_long'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      code = exception.code;
      detail = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code =
        status === HttpStatus.UNAUTHORIZED
          ? 'unauthorized'
          : status === HttpStatus.NOT_FOUND
            ? 'not_found'
            : 'invalid_request';
      detail = exception.message;
    } else {
      const transportStatus = getTransportStatus(exception);
      if (transportStatus !== undefined) {
        status = transportStatus;
        code =
          status === HttpStatus.NOT_FOUND ? 'not_found' : 'invalid_request';
        detail = titleForStatus(status);
      }
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: titleForStatus(status),
      status,
      code,
      detail,
      instance: request.url,
      requestId: request.id,
    };

    reply.status(status).type('application/problem+json').send(problem);
  }
}
