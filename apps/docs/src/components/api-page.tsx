'use client';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';

// Keep secrets out of this public site. Use deployment-local Scalar to execute.
export const APIPage = createOpenAPIPage({ playground: { enabled: false } });
