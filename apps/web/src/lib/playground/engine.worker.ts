import { createMyanLexApplication } from '@myanlex/application';
import { compareText, engineBuild, executeLocal } from '@myanlex/playground';

const application = createMyanLexApplication();
self.onmessage = (event: MessageEvent) => {
  try {
    const message = event.data;
    const value =
      message.type === 'compare'
        ? compareText(message.input, message.output)
        : executeLocal(application, message.request, engineBuild, () =>
            performance.now(),
          );
    self.postMessage({ value });
  } catch {
    self.postMessage({ error: 'local_failure' });
  }
};
