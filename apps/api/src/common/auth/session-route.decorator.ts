import { SetMetadata } from '@nestjs/common';

export const SESSION_ROUTE = Symbol('SESSION_ROUTE');
export const SessionRoute = () => SetMetadata(SESSION_ROUTE, true);
