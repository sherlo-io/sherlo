// Spike: run a sealed core file in a bare JS context and show what it installed.
//   node spike/core/check-core.js <sherlo-core.js>
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(process.argv[2], 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const core = sandbox.__SHERLO_CORE__;
console.log(core.describe(), '| seam', core.seam);
console.log('string payload  ->', core.extractStoryId(['button--primary']));
console.log('object payload  ->', core.extractStoryId([{ storyId: 'button--primary' }]));
console.log('nested payload  ->', core.extractStoryId([{ story: { id: 'button--primary' } }]));
console.log('first 3 lines of the sealed file:');
console.log(source.split('\n')[0]);
console.log(source.slice(source.indexOf('\n') + 1, source.indexOf('\n') + 1 + 300));
