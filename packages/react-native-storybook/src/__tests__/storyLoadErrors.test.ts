/**
 * ONE STORY FILE THAT THROWS AS IT LOADS: what Storybook's real prepareStories does with it (both
 * Storybook versions this repo can reach), and what the facts keep so capture can name the file.
 */
import { existsSync } from 'fs';
import { createRequire } from 'module';
import {
  __resetStorybookFactsForTests,
  readStorybookFacts,
  recordWhatStartWasHanded,
  storyLoadErrorAnswer,
} from '../getStorybook/storybookFacts';

// Storybook's dist requires react-native and its UI packages, which Node cannot parse here; only
// prepareStories runs, so those requests get an empty stand-in.
const nodeRequire = createRequire(__filename);
const NodeModule = nodeRequire('module');
const realLoad = NodeModule._load;
const standIn: any = new Proxy(function () {}, {
  get: (_target, key) => (key === '__esModule' ? false : standIn),
  apply: () => standIn,
});
function loadStorybook(path: string) {
  NodeModule._load = (request: string, ...rest: unknown[]) =>
    /^react-native(\/|$)|^@storybook\/react-native-(ui|theming|ui-common)/.test(request)
      ? standIn
      : realLoad(request, ...rest);
  try {
    return nodeRequire(path);
  } finally {
    NodeModule._load = realLoad;
  }
}
const storybook9 = loadStorybook('@storybook/react-native');

// Storybook 10 is installed in no package of this repo; the example app outside it holds 10.2.1.
const storybook10Path =
  '/Users/michalziolkowski/sherlo-workspace/.sherlo/examples/sherlo-eas-update/node_modules/@storybook/react-native';
const storybook10 = existsSync(storybook10Path) ? loadStorybook(storybook10Path) : null;

function storyEntries() {
  const files: Record<string, unknown> = {
    './Good.stories.tsx': { default: { title: 'Good' }, One: { args: {} } },
    './Bad.stories.tsx': () => {
      throw new Error('Cannot find module ./missing');
    },
  };
  const req: any = (name: string) => {
    const file = files[name];
    return typeof file === 'function' ? file() : file;
  };
  req.keys = () => Object.keys(files);
  return [{ directory: './src', req, importPathMatcher: /\.stories\.tsx$/ }];
}

afterEach(() => {
  __resetStorybookFactsForTests();
  vi.restoreAllMocks();
});

const setups: [string, any][] = [
  ['9.1.4', storybook9],
  ['10.2.1', storybook10],
];

describe.each(setups)(
  'Storybook %s prepareStories with one throwing story file',
  (_, storybook) => {
    if (!storybook) {
      it.skip('is not installed here', () => {});
      return;
    }

    it('skips the bad file and indexes the good one; it does not throw for all', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { index } = storybook.prepareStories({ storyEntries: storyEntries(), options: {} });
      expect(Object.keys(index.entries)).toEqual(['good--one']);
      expect(String(error.mock.calls[0][0])).toContain('Bad.stories.tsx');
    });

    it('keeps the bad file path and its error in the facts', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      recordWhatStartWasHanded({ storyEntries: storyEntries() }, storybook.prepareStories);
      const facts = readStorybookFacts()!;
      expect(Object.keys(facts.storyIndex)).toEqual(['good--one']);
      expect(Object.keys(facts.storyFiles)).toEqual(['./src/Good.stories.tsx']);
      expect(facts.storyLoadErrors).toEqual({
        './src/Bad.stories.tsx': 'Cannot find module ./missing',
      });
    });
  }
);

describe('storyLoadErrorAnswer', () => {
  const errors = { './src/Bad.stories.tsx': 'Cannot find module ./missing' };

  it('names the failed file for an id that file would hold', () => {
    expect(storyLoadErrorAnswer('src-bad--primary', errors)).toBe(
      'the story file ./src/Bad.stories.tsx failed to load: Cannot find module ./missing'
    );
    expect(storyLoadErrorAnswer('bad--primary', errors)).toContain('./src/Bad.stories.tsx');
  });

  it('gives nothing for an id in no file, so capture keeps its own message', () => {
    expect(storyLoadErrorAnswer('nowhere--x', errors)).toBeNull();
    expect(storyLoadErrorAnswer('good--one', {})).toBeNull();
  });
});
