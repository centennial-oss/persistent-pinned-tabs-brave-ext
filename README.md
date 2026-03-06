# Persistent Pinned Tabs for Brave

A Brave Browser extension that provides **true pinned tabs** that persist across sessions and windows instead of being forgotten when the tabs are closed or the app exits. Pins are stored per-profile and sync across all non-incognito windows.

## Features

- **Native tab bar integration** – Pins are injected as Brave's built-in pinned tabs when a Browser window opens. This extension intercepts the existing "Pin" and "Unpin" browser actions to intelligently persist pins without introducing new toolbars or UI features
- **Persistent pins** – Survive browser restarts and window closes
- **Profile-wide** – Identical pins in every non-incognito window
- **Vertical Tabs** – Works with Brave’s vertical tab layout

## Installation (Local / Unpacked)

1. **Load the extension in Brave**:
   - Open Brave and go to `brave://extensions`
   - Enable **Developer mode** (toggle in the top-right)
   - Click **Load unpacked**
   - Select the `persistent-pinned-tabs-brave-ext` folder

## Technical Notes

- **Extension icon** – Clicking the extension icon opens a settings page to allow customization of the saved pins.

## Project Structure

```
persistent-pinned-tabs-brave-ext/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker: storage, injection, context menu
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js    # Manual pin management
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Contributor Disclosure

Currently, the entirety of this project (application code, imagery, and documentation), save for minor edits to this README, was written 100% by Artificial Intelligence using a combination of Claude 4.x and Cursor Composer 1.x. In short, it was "Vibecoded." 

While we welcome Pull Requests and other contributions from other humans, we do not accept contributions from AI bots. A human must review, understand, and sign off on all commits. Please file an issue to discuss any proposed feature before working on it.

When humans start contributing their own code to the project, we will update this disclosure accordingly.

## License

Apache 2.0
