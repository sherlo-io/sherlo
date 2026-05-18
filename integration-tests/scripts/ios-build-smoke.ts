import { buildApp } from '../harness/app-builder.js';

const result = buildApp({
  appName: 'integrated-app-bare-rn',
  sbVersion: 'sb10',
  variantName: 'b-render-paths',
  platform: 'ios',
});
console.log(result);
