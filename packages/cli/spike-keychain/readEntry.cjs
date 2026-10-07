// SPIKE: read (or write, or delete) one keychain entry through @napi-rs/keyring, from whichever node
// runs this file - so a second node binary can be tested against an entry the first one created.
// Prints whether a value came back, never the value.
const { Entry } = require('@napi-rs/keyring');

const [act, account] = process.argv.slice(2);
const entry = new Entry('sherlo', account);
const started = Date.now();
if (act === 'write') entry.setPassword('{"token":"sht_SPIKE_not_real","email":"spike@example.com"}');
if (act === 'delete') console.log('deleted:', entry.deletePassword());
if (act === 'read') console.log('read: value', entry.getPassword() ? 'returned' : 'absent');
console.log(`${act} by ${process.execPath} ${process.version} took ${Date.now() - started} ms`);
