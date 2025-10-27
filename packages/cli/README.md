# Sherlo CLI

Command-line interface for [Sherlo](https://github.com/sherlo-io/sherlo) - Visual Testing for React Native Storybook.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

## Installation

```bash
npx sherlo@latest init
```

## Commands

### `sherlo init`

Initialize Sherlo in your project.

```bash
sherlo init [--token <token>]
```

**Options:**

- `--token <token>` - Authentication token for the project

---

### `sherlo test`

Run visual tests interactively.

```bash
sherlo test [options]
```

**Options:**

- `--android <path>` - Path to Android build (.apk)
- `--ios <path>` - Path to iOS build (.app, .tar.gz, .tar)
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)

---

### `sherlo test:standard`

Test standard builds.

```bash
sherlo test:standard [options]
```

**Options:**

- `--android <path>` - Path to Android build (.apk)
- `--ios <path>` - Path to iOS build (.app, .tar.gz, .tar)
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)

---

### `sherlo test:eas-update`

Test builds with dynamic JavaScript (OTA) updates.

```bash
sherlo test:eas-update [options]
```

**Options:**

- `--branch <branch>` - Name of the EAS Update branch to fetch the latest update from
- `--android <path>` - Path to Android build (.apk)
- `--ios <path>` - Path to iOS build (.app, .tar.gz, .tar)
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)

---

### `sherlo test:eas-cloud-build`

Test cloud builds created on Expo servers.

```bash
sherlo test:eas-cloud-build [options]
```

**Options:**

- `--easBuildScriptName <name>` - Name of the package.json script that triggers EAS Build
- `--waitForEasBuild` - Start waiting for EAS Build to be triggered manually
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)

---

### `sherlo eas-build-on-complete`

Process EAS Build (required for `test:eas-cloud-build`).

```bash
sherlo eas-build-on-complete [--profile <profile>]
```

**Options:**

- `--profile <profile>` - EAS Build profile (must match profile used in `test:eas-cloud-build`)
