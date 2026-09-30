import * as application from '@myanlex/application';
import * as core from '@myanlex/core';
import { localSuite } from './local-suite.mjs';

// Trap worker-specific network attempts as well as running the browser offline.
const denied = () => {
  throw new Error('Unexpected engine network access');
};
globalThis.fetch = denied;
globalThis.XMLHttpRequest = class {
  constructor() {
    denied();
  }
};
globalThis.WebSocket = class {
  constructor() {
    denied();
  }
};
globalThis.onmessage = () => {
  try {
    globalThis.postMessage({ result: localSuite(application, core) });
  } catch (error) {
    globalThis.postMessage({ error: String(error) });
  }
};
globalThis.postMessage({ ready: true });
