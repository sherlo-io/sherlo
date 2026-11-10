---
name: sherlo-tests
<!-- scenes -->
description: Finds the screens a React Native app has no Sherlo visual test for and writes one as a Sherlo scene and one as a Sherlo story, checking each with a capture. Use when asked to add Sherlo tests, add visual tests, raise Sherlo coverage, or write Sherlo scenes or stories.
<!-- /scenes -->
<!-- stories -->
description: Finds the screens a React Native app has no Sherlo visual test for and writes one as a Sherlo story, checking it with a capture. Use when asked to add Sherlo tests, add visual tests, raise Sherlo coverage, or write Sherlo stories.
<!-- /stories -->
metadata:
  version: "0"
---

# Sherlo tests

Sherlo is a visual regression testing tool for React Native. It takes pictures of your UI on iOS and Android simulators in the cloud, and each later run compares every picture with the approved one.

<!-- scenes -->

Sherlo tests a screen two ways. A Sherlo scene is one screen in one state, written beside the screen: Sherlo opens the app, plays the scene, and takes a picture. A Sherlo story is one Storybook story: Sherlo puts it on screen and takes a picture. This skill writes ONE scene and ONE story, proves each with a capture, and hands the result to the person. Write two tests, not ten.
<!-- /scenes -->
<!-- stories -->

A Sherlo story is one Storybook story: one screen in one state. Sherlo puts it on screen and takes a picture. This skill writes ONE story, proves it with a capture, and hands the result to the person. Write one test, not ten.
<!-- /stories -->

Use only the commands below. Every one prints what to do next.

## The loop

Copy this list and tick it off:

<!-- scenes -->

- [ ] 1. `npx sherlo suggest` - pick the easiest scene and the easiest story of the top 10
- [ ] 2. `npx sherlo suggest --facts <file>` - read what each screen needs
- [ ] 3. Write `<Screen>.scenes.tsx` beside the first screen, and `<Screen>.stories.tsx` beside the second
- [ ] 4. `npx sherlo capture --scene <id>` and `npx sherlo capture --story <id>` - fix every gap, capture again
- [ ] 5. Look at each picture and say what it shows
- [ ] 6. `npx sherlo preview` - show the person, ask if they are right
- [ ] 7. `npx sherlo test` - push them, hand over the review link

<!-- /scenes -->
<!-- stories -->

- [ ] 1. `npx sherlo suggest` - pick the easiest of the top 10
- [ ] 2. `npx sherlo suggest --facts <file>` - read what the screen needs
- [ ] 3. Write `<Screen>.stories.tsx` beside the screen
- [ ] 4. `npx sherlo capture --story <id>` - fix what it prints, capture again
- [ ] 5. Look at the picture and say what it shows
- [ ] 6. `npx sherlo preview` - show the person, ask if it is right
- [ ] 7. `npx sherlo test` - push it, hand over the review link

<!-- /stories -->

## 1. Pick the screen

Run `npx sherlo suggest`. It ranks the screens by how often they changed and broke, from the code and git history alone. Items marked `?` are unsure: the rules could not tell whether they are a screen, so you decide from the reason in the last column. Skip a header, a separator, a modal part and anything that is not a whole screen.

<!-- scenes -->

Each item says whether it is best written as a `scene` (a whole screen of the app, reached by a link or a tap) or a `story` (a screen or part that draws from props). Pick the easiest `scene` and the easiest `story` of the top 10: few data modules, no link param and few drawing states. `npx sherlo suggest --json` gives the same list with `kind` and `source` (`test`, `rule` or `unsure`) for each item.
<!-- /scenes -->
<!-- stories -->

Pick the easiest of the top 10 for a first test: a screen with few data modules, no link param and few drawing states. `npx sherlo suggest --json` gives the same list with `source` (`test`, `rule` or `unsure`) for each item.
<!-- /stories -->

Do not pick a screen only because it is first. A screen that needs a camera or a native module is a hard first test.

## 2. Read the facts

Run `npx sherlo suggest --facts <file>` with the file of the screen. It prints:

- the real screen behind a thin route file, and the components it draws
- the data modules it reads: network, state and storage libraries, and the app's own data files
- the link params it reads (`useLocalSearchParams` names, or route params)
- the conditions that change what it draws: loading, empty, error, signed out
- its test ids, or `none: find the ready view by text`

<!-- scenes -->

Add `--json` for the same facts as data. Each data module is something to mock in step 3. Each drawing state is a scene or story you could write; for the first tests pick the plain one, with data.
<!-- /scenes -->
<!-- stories -->

Add `--json` for the same facts as data. Each data module is something to mock in step 3. Each drawing state is a story you could write; for the first test pick the plain one, with data.
<!-- /stories -->

<!-- scenes -->

## 3a. Write the scene

Create `<Screen>.scenes.tsx` beside the screen file. The scene id is the file name before `.scenes`, a double dash, and the scene name, all lowercase with dashes: `Inbox.scenes.tsx` with a scene `Full` has the id `inbox--full`.

```tsx
import { mockRequest } from '@sherlo/react-native-storybook';
import { scenes } from '@sherlo/react-native-storybook/scenes';

// Written once and imported by every scene file: what the app needs to start, and the logged-in user.
import { appMocks } from '../../app.mocks';

export default scenes({
  scenes: {
    Full: {
      given: [
        appMocks,
        mockRequest(
          { method: 'GET', url: 'https://api.example.test/inbox' },
          { body: { items: [{ id: 1, title: 'Welcome' }] } }
        ),
      ],
      play: [{ tap: 'tab-inbox' }],
      ready: { testID: 'inbox-list' },
    },
  },
});
```

- `given` is what the scene starts from, in order; a later entry wins. Put data here, never in the screen.
- `play` takes the app from its first screen to this one: `{ open: 'myapp://series/7' }` for a link, `{ tap: 'testID or visible text' }` for a tap. Leave it out for a screen the app opens on.
- `ready` names a view that shows only when the screen has its data: `{ testID: 'inbox-list' }`, or `{ text: 'Welcome' }` when the screen has no test id. Name something the data draws, never a header that is there at once.
- Mock the app's own data module with `mock(() => import('./providers/DataClient'), { useDataClient: () => ({ ... }) })`. Mock a network call with `mockRequest`. Use the app's real client and put the data in its cache or store; never mock the component you are testing.
- A link param (`series/[id]`) is given in the `open` link: `{ open: 'myapp://series/7' }`.

Write the states the code really has (find them under `states` in the facts). One scene for the first test.

### A screen behind a login

Every scene starts on a clean device, so the session a real user has saved is not there, and the app opens on its login screen. A signed-in scene hands the app a logged-in user in the same place the app looks for one. Work it out from the app's own code, in three steps.

1. **Find where the app keeps its session.** Start at the code that chooses between the login screens and the signed-in ones: the root navigator, the root layout, or a guard around the signed-in routes. Find the value it checks (a user, a session, a token, an `isSignedIn` flag) and follow it back to where it comes from. That is usually a token the app saved and reads at launch (secure storage, AsyncStorage, MMKV, the keychain), an auth library's client that restores its own session, or a store the app fills after sign-in. The first of these the app reads as it starts is what the scene fakes.
2. **Give the logged-in user in `appMocks`.** Put the session in the shared file every scene file imports, so each signed-in scene starts as the same user. Fake the session where the app reads it, and answer the requests the app makes once it is signed in (the current user, a token refresh) with that same user:

   ```ts
   // app.mocks.ts, beside the app's entry file
   import { mock, mockRequest } from '@sherlo/react-native-storybook';
   import { given } from '@sherlo/react-native-storybook/scenes';

   // The user every signed-in scene starts as, shaped like what the app's own code reads.
   export const SIGNED_IN_USER = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.test' };

   export const appMocks = given(
     // Where this app keeps its session: the saved token its auth provider reads at launch.
     mock(() => import('./src/auth/sessionStorage'), {
       readSession: async () => ({ accessToken: 'scene-token', userId: SIGNED_IN_USER.id }),
     }),
     // What the app asks for once it has the token.
     mockRequest({ method: 'GET', url: 'https://api.example.test/me' }, { body: SIGNED_IN_USER })
   );
   ```

   Use the names the app's code really has: the module, the function, the fields it reads, the address it calls. Fake the lowest place you found, the saved session rather than the screen's own hooks, so the app's provider, store and navigator run as they do for a real user. When the session lives in a real object the app makes at start, such as a store or an auth client, start that object holding the user with `startState(authStore, { user: SIGNED_IN_USER })` instead.

3. **Capture the signed-in screen.** Run `npx sherlo capture --scene <id>`. If it says the scene `never got ready` and the app stayed on a login screen (such as `AuthStack › SignIn`), the app did not find the session: the fake is not where the app reads it at launch. Follow the check from step 1 again, one step closer to the start of the app, and capture again. A `ran as real code` line that names the session's module means the fake missed it. When the capture ends with `captured`, the picture shows the screen as the logged-in user, never the login screen.

For the signed-out state of a screen, give `signedOut()` (from `@sherlo/react-native-storybook/scenes`) in place of the logged-in user.

## 3b. Write the story

<!-- /scenes -->
<!-- stories -->

## 3. Write the story

<!-- /stories -->

Create `<Screen>.stories.tsx` beside the screen file, where the project's Storybook finds stories. The story id is what Storybook calls it: the title and the story name, lowercase with dashes, joined by a double dash: title `Inbox` with a story `Full` has the id `inbox--full`.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { mockRequest } from '@sherlo/react-native-storybook';
import { InboxScreen } from './InboxScreen';

export default {
  title: 'Inbox',
  component: InboxScreen,
  parameters: {
    sherlo: {
      mocks: [
        mockRequest(
          { method: 'GET', url: 'https://api.example.test/inbox' },
          { body: { items: [{ id: 1, title: 'Welcome' }] } }
        ),
      ],
    },
  },
} as Meta<typeof InboxScreen>;

export const Full: StoryObj<typeof InboxScreen> = {};
```

- Mock each network call the screen makes with `mockRequest` in `parameters.sherlo.mocks`. Put the data there or in the story's `args`, never in the screen.
- A screen that needs the app's providers gets them from a decorator, the way the project's other stories do.
- Never mock the component you are testing.

<!-- scenes -->

One story for the first test.
<!-- /scenes -->
<!-- stories -->

Write the states the code really has (find them under `states` in the facts). One story for the first test.
<!-- /stories -->

## 4. Capture and fix every gap

<!-- scenes -->

Run `npx sherlo capture --scene <id>`. A scene with gaps does not stop at the first: it lets the screen go on and fails with exit 1, listing EVERY gap at once. Fix them all, then capture again.

| What the capture prints                     | What to do                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `had no mock` with `mockRequest(...)` lines | Paste each rule into `given` and fill in the body from what the screen reads                                                         |
| `ran as real code` with module paths        | A data module ran for real. Mock the ones that call a server, a database or the phone                                                |
| `The ready view showed after step N of M`   | The `ready` view is there before the last step. Name a view the data draws                                                           |
| `never got ready`                           | Look at the screen it says the app stayed on: a missing login (see "A screen behind a login"), a missing mock or a wrong `play` step |
| `its play could not go on`                  | The `tap` text or test id is wrong. Use one the capture printed                                                                      |
| `never booted`                              | Read the error. A provider or a native module is missing: add it to `appMocks`                                                       |
| `No picture saved`                          | The scene was not captured. Fix the line above it first                                                                              |

When the capture ends with a tick and `captured`, there are no gaps.

Then run `npx sherlo capture --story <id>` for the story. Fix what it prints the same way, in the story's `parameters.sherlo.mocks`, and capture again until it ends with `captured`.
<!-- /scenes -->
<!-- stories -->

Run `npx sherlo capture --story <id>`. It puts the story on screen the way a test run does and prints what went wrong: a request with no mock, a story that threw, a screen that never settled. Fix it in the story, then capture again, until it ends with `captured`.
<!-- /stories -->

## 5. Check the picture

The picture is kept in `.sherlo/captures`. Open it and say, in one sentence, what it shows. It is right only when it shows the state you meant, with the data you gave. It is wrong when it shows a spinner, an empty list that should be full, an error screen, a login screen, or a half-drawn screen. If it is wrong, fix the test and capture again; never accept a wrong picture.

## 6. Preview and ask

<!-- scenes -->

Run `npx sherlo preview`. It shows the pictures you captured. Tell the person what each picture shows and ask if they are the screens they wanted tested. Wait for the answer. If they say no, change the test and go back to step 4.
<!-- /scenes -->
<!-- stories -->

Run `npx sherlo preview`. It shows the pictures you captured. Tell the person what the picture shows and ask if it is the screen they wanted tested. Wait for the answer. If they say no, change the story and go back to step 4.
<!-- /stories -->

## 7. Push and hand over

Run `npx sherlo test`. The first run builds the app and stores the build, so it takes a while. When it finishes it prints a review link. Hand that link to the person and tell them the new pictures wait for their approval there. Do not approve a picture yourself.

If `sherlo test` asks for a login or a token, stop and tell the person; do not look for one.

## Do not

- Do not edit the app code to make a test pass. If the screen cannot be tested without a change, say so and stop.
- Do not invent states. Every test traces to a condition in the code.

<!-- scenes -->

- Do not write scene or story files outside the screen's folder, and do not touch other test files.

<!-- /scenes -->
<!-- stories -->

- Do not write story files outside the screen's folder, and do not touch other test files.

<!-- /stories -->

- Do not mock the component under test, only what it reads.
- Do not skip the capture, and do not accept a picture you have not looked at.

<!-- scenes -->

- Do not write more than one scene and one story in the first session. The person asked for first tests; more come after they see them.

<!-- /scenes -->
<!-- stories -->

- Do not write more than one test in the first session. The person asked for a first test; more come after they see it.

<!-- /stories -->

- Do not delete or change an existing test or story.
- Do not approve the picture, push a branch or open a pull request unless asked.

## When it is stuck

If a capture fails twice with the same gap, stop and tell the person what you tried and the exact lines the capture printed. Do not go around the tool.
