/**
 * A LOOK AT THE PHONE'S SCREEN, taken from outside the app: the words on it, how many views it
 * draws, whether something on it is loading, and whether a system permission dialog covers it.
 *
 * The app answers its scene only when it is done, so a scene that sits on the wrong screen says
 * nothing for minutes; the look is how the command sees that screen while it waits. An Android
 * phone gives one with `uiautomator dump`. An iOS simulator has no such dump, so a look there is
 * nothing, and the command waits for the app's answer as it always did.
 */
import { deviceState } from './deviceState';
import type { SceneDevice } from './deviceState';

/** What one look at the screen found. */
export type ScreenLook = {
  /** The words on the screen, in the order the dump lists them. */
  words: string[];
  /** The views the screen draws, not counting the plain containers that hold them. */
  views: number;
  /** A progress indicator is on screen: something is still loading. */
  loading: boolean;
  /** The permission a system dialog on the screen asks for, when one covers the app. */
  permission?: string;
};

/** The system packages whose dialogs ask for a permission. */
const PERMISSION_DIALOG_PACKAGES = ['permissioncontroller', 'packageinstaller'];

/** What each permission's words in a dialog name it by. */
const PERMISSION_WORDS: [RegExp, string][] = [
  [/camera/i, 'camera'],
  [/microphone|record audio/i, 'microphone'],
  [/location/i, 'location'],
  [/contacts/i, 'contacts'],
  [/photos|media|files/i, 'photos'],
  [/calendar/i, 'calendar'],
  [/notification/i, 'notifications'],
];

/** The containers that hold views and draw nothing of their own. */
const PLAIN_CONTAINERS = [
  'android.view.View',
  'android.view.ViewGroup',
  'android.widget.FrameLayout',
];

/** Look at the screen of `device`; nothing when the phone gives no look. */
export async function lookAtScreen(device: SceneDevice): Promise<ScreenLook | undefined> {
  if (device.platform !== 'android') return undefined;
  const dump = await deviceState()
    .run('adb', ['-s', device.serial, 'shell', 'uiautomator', 'dump', '/dev/tty'])
    .catch(() => '');
  return readUiDump(dump);
}

/** The look a `uiautomator dump` holds; nothing when the dump holds no screen. */
export function readUiDump(dump: string): ScreenLook | undefined {
  const nodes = [...dump.matchAll(/<node\s[^>]*>/g)].map(([tag]) => attributesOf(tag));
  if (nodes.length === 0) return undefined;

  const words = nodes.flatMap((node) => [node.text, node['content-desc']]).filter(Boolean);
  const views = nodes.filter(
    (node) => node.text || node['content-desc'] || !PLAIN_CONTAINERS.includes(node.class)
  ).length;
  const loading = nodes.some((node) => /ProgressBar/.test(node.class));
  const asksForPermission = nodes.some((node) =>
    PERMISSION_DIALOG_PACKAGES.some((name) => node.package?.includes(name))
  );
  const permission = asksForPermission
    ? (PERMISSION_WORDS.find(([pattern]) => pattern.test(words.join(' ')))?.[1] ?? 'system')
    : undefined;
  return { words, views, loading, ...(permission && { permission }) };
}

/** The attributes of one `<node ...>` tag, by name. */
function attributesOf(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])
  );
}
