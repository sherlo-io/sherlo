<br />

<p align="center">
  <a href="https://sherlo.io/" title="Sherlo - Visual Testing for React Native Storybook">
    <picture>
      <source media="(prefers-color-scheme: dark) and (max-width: 500px)" srcset="/assets/logo-dark.svg" width="140">
      <source media="(prefers-color-scheme: dark)" srcset="/assets/logo-dark.svg" width="176">
      <source media="(max-width: 500px)" srcset="/assets/logo-light.svg" width="140">
      <img src="/assets/logo-light.svg" alt="Sherlo - Visual Testing for React Native Storybook" width="176" />
    </picture>
  </a>
</p>

<p align="center"><strong>Visual Testing for React Native Storybook</strong></p>

<br />

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark) and (max-width: 500px)" srcset="/assets/hero-mobile-dark.gif" width="436">
    <source media="(max-width: 500px)" srcset="/assets/hero-mobile-light.gif" width="436">
    <source media="(prefers-color-scheme: dark)" srcset="/assets/hero-desktop-dark.gif" width="560">
    <img src="/assets/hero-desktop-light.gif" alt="Animated demo of Sherlo running visual regression tests on a React Native Storybook" width="560" />
  </picture>
</div>

# Sherlo

**Visual regression testing for React Native Storybook**. Capture screenshots on iOS and Android simulators in the cloud, detect visual changes, and ship UI updates with confidence.

▶️ [Sherlo in 2 minutes](https://sherlo.io/#video)

### How It Works

1. **📸 Capture** - Sherlo takes screenshots of your UI on iOS and Android devices in the cloud
2. **🔍 Detect** - All visual changes are automatically detected by comparison with previous versions
3. **👍 Review** - Your team reviews detected changes before they go live

### Key Benefits

- **🖼️ Pixel Perfection** - Your designs, implemented exactly as intended
- **✅ Ship with Confidence** - See exactly what changed before release - no surprises in production
- **⏱️ Minutes Not Hours** - Forget device-by-device checks - every UI update caught automatically
- **🤝 Review Together** - One place where devs, designers, PMs, and QA collaborate
- **📱 Real Mobile Testing** - Native iOS & Android testing - not web approximations like React Native Web
- **☁️ Visual Testing Cloud** - You build, we test - on infrastructure built specifically for mobile UI testing

<br />

## Quick Start

#### 1) Install Sherlo

```bash
npx sherlo init
```

#### 2)<sup>\*</sup> Customize [test devices](https://sherlo.io/docs/config#devices) _(optional)_

<!-- prettier-ignore -->
```json
[
  { "id": "iphone.15", "osVersion": "17" },
  { "id": "pixel.7", "osVersion": "13", "theme": "dark" },
  { "id": "ipad.10.gen", "osVersion": "17", "locale": "en_GB", "fontScale": "+2" }
]
```

#### 3) Run visual tests

```bash
npx sherlo test
```

<br />

🎉 **That's it!** Your visual testing is ready.

<br />

[Full documentation →](https://sherlo.io/docs)

<br />

## Examples

Try Sherlo with ready-to-run example projects.

### What's Inside

- **📱 Minimal Apps** - React Native + Storybook integrated with Sherlo
- **🤖 GitHub Actions** - CI/CD workflows for automated testing
- **🔄 Different Workflows** - Standard builds, OTA updates, and Expo cloud builds

<br />

[Browse examples →](./examples)

<br />

## Review App

Review visual changes across devices in one web app as a team - from developers to designers.

### Features

- **📸 Visual Comparison** - Compare before/after screenshots with highlighted changes
- **💬 Team Feedback** - Approve or reject changes and leave comments
- **🔍 Code Inspector** - Inspect React Native styles directly in the browser
- **🎨 Figma Preview** - Compare UI with Figma designs side-by-side
- …and more

<br />

<div align="center">
  <img src="/assets/demo.gif" alt="Demo of Sherlo's web application showing review workflow with visual diffs, comments, code inspection, and Figma preview" />
</div>

<br />

## New to Storybook?

Join thousands of teams using Storybook - a tool that helps you develop and document UI components.

<br />

**🧘 Build in Isolation** - No need to run the full app or navigate through screens

**📚 Auto Docs** - Write once, get both components and documentation

**💖 Perfect with Sherlo** - Plug in and get iOS & Android visual tests automatically - zero extra effort

<br />

[Storybook for React Native →](https://github.com/storybookjs/react-native)

<br />

## Join the Community

💬 [Join our Discord](https://discord.gg/G7eqTBkWZt) - Get help and chat with the community

📢 [Follow us on X](https://x.com/sherlo_io) - Latest updates and React Native tips

📧 Questions? contact@sherlo.io

<br />

---

<div align="center">
  <strong>⭐ Star this repo</strong> to support the project!
</div>

---

<br />

<div align="center">
  <a href="https://sherlo.io" title="Sherlo - Visual Testing for React Native Storybook">Website</a> • 
  <a href="https://app.sherlo.io" title="Sherlo review app">App</a> • 
  <a href="https://sherlo.io/docs" title="Sherlo documentation">Docs</a> • 
  <a href="./examples" title="Sherlo examples">Examples</a>
</div>

<br />
