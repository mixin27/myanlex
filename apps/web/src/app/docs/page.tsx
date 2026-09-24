import { redirect } from 'next/navigation';
import { documentationUrl } from '@/lib/documentation';

export default function DocsPage(): never {
  redirect(`${documentationUrl}/docs`);
}
