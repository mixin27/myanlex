import 'reflect-metadata';

import { HTTP_PORT } from './common/tokens.js';
import { createApiApplication } from './create-api-application.js';

const application = await createApiApplication();
const port = application.get<number>(HTTP_PORT);

await application.listen(port, '0.0.0.0');
