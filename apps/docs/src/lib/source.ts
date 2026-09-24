import { loader, multiple } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';
import { openapi } from './openapi';

const docs = defineDocs({ dir: 'content/docs' });
export const source = loader({
  baseUrl: '/docs',
  source: multiple({
    docs: docs.toFumadocsSource(),
    api: await openapi.staticSource({
      baseDir: 'reference',
      groupBy: 'tag',
      meta: true,
    }),
  }),
  plugins: [openapi.loaderPlugin()],
});
