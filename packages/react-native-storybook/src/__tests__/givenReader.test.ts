// The bundle-time reader of a scene's `given` list (metro/givenReader.js): it works out the phone
// settings and the member the list holds, by evaluating the team's own precondition functions, with
// no Babel core. What the bundler cannot know is refused, naming the file and the scene.
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const sceneFiles = require('../../metro/sceneFiles');

function sceneFileWith(source: string): { file: string; source: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-given-reader-'));
  const file = path.join(root, 'a.scenes.tsx');
  fs.writeFileSync(file, source, 'utf8');
  return { file, source };
}

function phoneOf(givenList: string, before = ''): unknown {
  const { file, source } = sceneFileWith(`${before}
export default scenes({ scenes: { Only: { given: ${givenList} } } });`);
  return sceneFiles.sceneDevicesOf(file, source).Only;
}

describe('the reader of a given list', () => {
  it('a precondition function with a parameter and a default is evaluated with its arguments', () => {
    const phone = phoneOf(
      '[near(), near(7)]',
      'const near = (latitude = 1) => ({ device: { location: { latitude, longitude: 2 } } });'
    );

    expect(phone).toEqual({ location: { latitude: 7, longitude: 2 } });
  });

  it('a list nested in a list and an object spread are flattened in order, the later one winning', () => {
    const phone = phoneOf(
      '[both]',
      `const base = { permissions: { camera: 'granted', photos: 'denied' } };
const both = [{ device: base }, [{ device: { ...base, permissions: { photos: 'granted' } } }]];`
    );

    expect(phone).toEqual({ permissions: { camera: 'granted', photos: 'granted' } });
  });

  it('a conditional on a known value picks its branch', () => {
    const phone = phoneOf(
      '[pick(true)]',
      "const pick = (on) => ({ device: on ? { permissions: { camera: 'granted' } } : {} });"
    );

    expect(phone).toEqual({ permissions: { camera: 'granted' } });
  });

  it('a fake the list holds, which the bundle does not need to know, does not stop the reading', () => {
    const phone = phoneOf(
      "[mockRequest(() => 1), { device: { permissions: { camera: 'denied' } } }]"
    );

    expect(phone).toEqual({ permissions: { camera: 'denied' } });
  });

  it('a precondition whose phone settings depend on a branch is refused naming its function', () => {
    const { file, source } = sceneFileWith(`function onlyOnNewPhones(model) {
  if (model === 'new') return { device: { permissions: { camera: 'granted' } } };
  return {};
}
export default scenes({ scenes: { Branchy: { given: [onlyOnNewPhones('new')] } } });`);

    expect(() => sceneFiles.sceneDevicesOf(file, source)).toThrow(
      /a\.scenes\.tsx.*function onlyOnNewPhones in a\.scenes\.tsx.*scene Branchy/
    );
  });

  it('a member that cannot be worked out is refused with the file and scene named', () => {
    const { file, source } = sceneFileWith(
      'export default scenes({ scenes: { Who: { given: [{ member: whoever() }] } } });'
    );

    expect(() => sceneFiles.sceneDevicesOf(file, source)).toThrow(
      /a\.scenes\.tsx.*member of scene Who/
    );
  });
});
