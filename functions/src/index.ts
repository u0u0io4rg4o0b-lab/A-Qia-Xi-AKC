// functions/src/index.ts  
import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ region: 'asia-east1' });

export * from './siwe';
export * from './awardPoints';
export * from './hydrate';