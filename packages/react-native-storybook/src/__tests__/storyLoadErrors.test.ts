/**
 * A STORY FILE THAT THROWS AS IT LOADS: what the facts keep of it so capture can name the file, and
 * the title the bundle recorded for it so its story ids can be matched to it.
 */
import {
  __resetStorybookFactsForTests,
  readStorybookFacts,
  recordWhatStartWasHanded,
} from '../getStorybook/storybookFacts';

function storyEntries() {
  const files: Record<string, () => unknown> = {
    './Good.stories.tsx': () => ({ default: { title: 'Good' }, One: { args: {} } }),
    './Bad.stories.tsx': () => {
      throw new TypeError('Cannot find module ./missing');
    },
  };
  const req: any = (name: string) => files[name]();
  req.keys = () => Object.keys(files);
  return [{ directory: './src', req, importPathMatcher: /\.stories\.tsx$/ }];
}

afterEach(() => {
  __resetStorybookFactsForTests();
});

describe('a story file that throws while it loads', () => {
  it("a story file that throws while it loads is kept with its error, and the other files' stories stay known", () => {
    recordWhatStartWasHanded({ storyEntries: storyEntries() }, undefined);

    const facts = readStorybookFacts()!;
    expect(Object.keys(facts.storyFiles)).toEqual(['./src/Good.stories.tsx']);
    expect(facts.brokenFiles).toEqual([
      {
        file: './src/Bad.stories.tsx',
        error: { name: 'TypeError', message: 'Cannot find module ./missing' },
      },
    ]);
  });

  it('a story file with its own title is matched to its stories through the file-to-title record', () => {
    // The file's own title shares nothing with its path, so only the record can name its stories.
    recordWhatStartWasHanded({ storyEntries: storyEntries() }, undefined, {
      './src/Bad.stories.tsx': 'Shop/Checkout',
      './src/Good.stories.tsx': 'Good',
    });

    expect(readStorybookFacts()!.brokenFiles).toEqual([
      {
        file: './src/Bad.stories.tsx',
        error: { name: 'TypeError', message: 'Cannot find module ./missing' },
        title: 'Shop/Checkout',
      },
    ]);
  });

  it('a launch where every story file loads keeps no broken files', () => {
    const entries = storyEntries();
    entries[0].req.keys = () => ['./Good.stories.tsx'];
    recordWhatStartWasHanded({ storyEntries: entries }, undefined);
    expect(readStorybookFacts()!.brokenFiles).toBeUndefined();
  });
});
