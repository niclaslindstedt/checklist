import type { Widen } from "./_widen";

// Strings for the settings dialog (the modal shell, its tabs, and the
// controls inside them). Theme, font, and colour-slot *display names*
// are not here — those proper nouns and data-table labels live with the
// theme data in `src/theme/`.

const settings = {
  title: "Settings",
  close: "Close settings",
  sections: "Settings sections",
  done: "Done",

  tab: {
    general: "General",
    theme: "Theme",
    storage: "Storage",
    developer: "Developer",
    logs: "Logs",
  },

  general: {
    title: "General",
    blurb:
      "checklist is a local-first app — your lists live in this browser. Appearance settings are saved on this device.",
    devMode: "Developer mode",
    devModeHint:
      "Reveal the Developer and Logs tabs for capturing diagnostics and loading sample data.",
  },

  developer: {
    title: "Developer",
    blurb:
      "Diagnostics for development. These settings stay on this device and never travel with a shared list.",
    captureLogs: "Capture logs",
    captureLogsHint:
      "Record the in-app log to this browser so it survives a reload. View it on the Logs tab.",
    fakeData: "Fake data",
    fakeDataHint:
      "Replace your data with an in-memory sample document for this session. Reload (or turn off) to return to your real lists — the sample is never saved.",
  },

  appearance: {
    theme: "Theme",
    mode: "Mode",
    variant: "Variant",
    systemNote: "Follows your operating system's light / dark setting.",
    font: "Font",
    fontFamily: "Font family",
    textSize: "Text size",
    colours: "Colours",
    shapeMotion: "Shape & motion",
    cornerRadius: "Corner radius",
    density: "Density",
    borderWidth: "Border width",
    reduceMotion: "Reduce motion",
    reduceMotionHint: "Disable transitions and animations across the app.",
  },

  storage: {
    backendTitle: "Storage",
    backendBlurb:
      "Choose where your lists are saved. Cloud backends sync the same document across your devices; this device keeps it in this browser only.",
    backendBrowser: "This device",
    backendDropbox: "Dropbox",
    backendGoogleDrive: "Google Drive",
    browserHint:
      "Your lists live in this browser's storage. Nothing leaves this device.",
    dropboxConnected:
      "Connected. Your lists sync to a private app folder in your Dropbox.",
    dropboxUnconnected:
      "Connect your Dropbox to sync your lists to a private app folder.",
    gdriveConnected:
      "Connected. Your lists sync to a folder in your Google Drive.",
    gdriveUnconnected:
      "Connect your Google Drive to sync your lists to a folder you control.",
    connect: "Connect",
    disconnect: "Disconnect",
    connected: "Connected",
    encryptionTitle: "Encryption",
    encryptionOn: "Encryption is on",
    encryptionOff: "Encryption is off",
    encryptionHint:
      "When on, your lists are encrypted with a passphrase before being saved — on this device and in the cloud. Only someone with the passphrase can read them.",
    enableEncryption: "Turn on encryption",
    disableEncryption: "Turn off encryption",
    passphrase: "Passphrase",
    passphraseConfirm: "Confirm passphrase",
    passphraseWarning:
      "There is no recovery. If you forget this passphrase, your lists cannot be read.",
    passphraseTooShort: "Use a passphrase of at least 4 characters.",
    passphraseMismatch: "The passphrases don't match.",
    cancel: "Cancel",
    unlockTitle: "Unlock your lists",
    unlockHint:
      "Your lists are encrypted. Enter your passphrase to unlock them on this device.",
    unlock: "Unlock",
    unlockWrong: "Wrong passphrase. Try again.",
  },

  logs: {
    title: "Logs",
    filter: "Filter",
    filterAria: "Filter logs by level",
    all: "All",
    info: "Info",
    warnings: "Warnings",
    errors: "Errors",
    copy: "Copy",
    clear: "Clear",
    none: "No entries.",
    countOne: "{n} entry.",
    countOther: "{n} entries.",
    copied: "Copied to clipboard.",
    copyFailed: "Copy failed.",
  },
} as const;

export type SettingsCatalog = Widen<typeof settings>;

export default settings;
