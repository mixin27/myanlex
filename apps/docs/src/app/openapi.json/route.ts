import { openapi } from '@/lib/openapi';

export const dynamic = 'force-static';
export async function GET() {
  const { bundled } = await openapi.getSchema('myanlex');
  return Response.json(bundled);
}
