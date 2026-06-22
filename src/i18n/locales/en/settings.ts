import type { Widen } from "./_widen";

// Strings for the settings dialog (the modal shell, its tabs, and the
// controls inside them). Theme, font, and colour-slot *display names*
// are not here — those proper nouns and data-table labels live with the
// theme data in `src/theme/`.

const settings = {
  title: "Settings",
  close: "Close settings",
  sections: "Settings sections",
  chooseSection: "Choose section",

  tab: {
    general: "General",
    lists: "Lists",
    theme: "Theme",
    storage: "Storage",
    developer: "Developer",
    logs: "Logs",
  },

  general: {
    blurb:
      "checklist is a local-first app — your lists live in this browser. Appearance settings are saved on this device.",
    languageSection: "Language",
    interfaceSection: "Interface",
    notificationsSection: "Notifications",
    achievementsSection: "Achievements",
    developerSection: "Developer",
    language: "Language",
    languageHint:
      "Switch the app's language. Saved on this device — it doesn't travel with a shared list.",
    devMode: "Developer mode",
    devModeHint:
      "Reveal the Developer and Logs tabs for capturing diagnostics and loading sample data.",
    menuButton: "Show menu button",
    menuButtonHint:
      "When off, swipe in from the edge of the screen to open the menu.",
    disableToasts: "Disable toasts",
    disableToastsHint:
      "Stop showing pop-up notifications. The “new build ready” upgrade hint still appears.",
    disableAchievements: "Disable achievements",
    disableAchievementsHint:
      "Stop tracking achievements and hide the trophy button. Achievements you’ve already earned are kept.",
  },

  lists: {
    addingSection: "Adding items",
    displaySection: "Display",
    addItemPosition: "Add new items to",
    addItemPositionHint: "Where a new item lands when you add it to a list.",
    addItemTop: "Top",
    addItemBottom: "Bottom",
    sortCheckedToBottom: "Sort checked items to the bottom",
    sortCheckedToBottomHint:
      "Checking an item sinks it below the unchecked ones, with the most recently checked first. The list itself isn’t reordered — unchecking puts it straight back.",
    disableItemNotes: "Disable item notes",
    disableItemNotesHint:
      "Make items title-only — hide the note body and the “Add note” editor. Notes you’ve already written are kept, just hidden.",
    showItemCount: "Show item count",
    showItemCountHint:
      "Show the progress counter (checked / total) in the list header.",
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
    motion: "Motion",
    animateSortChecked: "Animate sorted items",
    animateSortCheckedHint:
      "When “Sort checked items to the bottom” is on, slide them into place instead of jumping. Has no effect while that sorting is off.",
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
    backendFolder: "Local folder",
    backendDropbox: "Dropbox",
    backendGoogleDrive: "Google Drive",
    browserHint:
      "Your lists live in this browser's storage. Nothing leaves this device.",
    folderConnected:
      "Connected. Each list is saved as a markdown file in your folder — open or edit it with any tool.",
    folderUnconnected:
      "Pick a folder on this device. Each list is saved there as a markdown file you can open, edit, or back up with any tool.",
    folderReconnectHint:
      "This browser needs permission to use your folder again. Reconnect to grant it.",
    folderReconnect: "Reconnect folder",
    folderChoose: "Choose folder",
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
    encryptionBusyEnabling: "Turning encryption on…",
    encryptionBusyDisabling: "Turning encryption off…",
    encryptionStepReading: "Reading your lists…",
    encryptionStepDerivingKey: "Deriving encryption key…",
    encryptionStepEncrypting: "Encrypting your lists…",
    encryptionStepDecrypting: "Decrypting your lists…",
    encryptionStepSaving: "Saving your lists…",
    encryptionStepFinalizing: "Finalizing…",
    encryptionFailed: "Something went wrong. Tap to see the log.",
    encryptionStatusAria: "Encryption progress",
    encryptionLogTitle: "Encryption log",
    encryptionLogEmpty: "Nothing was logged.",
    cancel: "Cancel",
    unlockTitle: "Unlock your lists",
    unlockHint:
      "Your lists are encrypted. Enter your passphrase to unlock them on this device.",
    unlock: "Unlock",
    unlockWrong: "Wrong passphrase. Try again.",
    unlockOffline:
      "Can't reach your cloud, and there's no offline copy saved on this device yet. Reconnect and try again.",
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
