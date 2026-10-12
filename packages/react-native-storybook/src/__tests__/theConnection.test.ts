import { describe, it } from 'vitest';

// Shells written in plan (epic runner-without-files); task rwf-sdk-app-line-js fills them.
describe('the connection', () => {
  it.todo('the JavaScript sends and receives through the native client and opens no socket of its own');
  it.todo("a bundle served by a bundler dials that bundler's own Sherlo address");
  it.todo('a bundle loaded from the device with no address handed at launch opens no connection');
  it.todo(
    "the app's first message on every connection is hello, carrying the protocol version and the SDK's JS and native versions"
  );
  it.todo('outside testing mode the app sends no story report and no error over the connection');
});
