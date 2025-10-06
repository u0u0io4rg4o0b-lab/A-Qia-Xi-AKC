import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({
  region: process.env.FUNCTIONS_REGION ?? 'asia-east1',
  timeoutSeconds: 10,
  maxInstances: 5,
});
export * from './siwe';
export * from './awardPoints';
export * from './hydrate';