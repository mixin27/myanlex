import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { APIPage } from '@/components/api-page';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.type === 'docs' ? page.data.body : null;
  return (
    <DocsPage toc={page.data.toc} full={page.data.type === 'api'}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {page.data.type === 'api' ? (
          <APIPage {...page.data.getOpenAPIPageProps()} />
        ) : (
          MDX && (
            <MDX
              components={getMDXComponents({
                a: createRelativeLink(source, page),
              })}
            />
          )
        )}
      </DocsBody>
    </DocsPage>
  );
}
export function generateStaticParams() {
  return source.generateParams();
}
export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>,
): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
