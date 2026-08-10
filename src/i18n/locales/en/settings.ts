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
    transform: "Transform",
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
    deadlineReminders: "Deadline reminders",
    deadlineRemindersHint:
      "Get a notification when an item with a due date is due — even when the app is closed. Repeating deadlines re-arm themselves.",
    reminderLeadTimes: "Remind me",
    reminderLeadOnDay: "On the due day",
    reminderLeadDayBefore: "The day before",
    reminderLeadWeekBefore: "A week before",
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
    countCategories: "Count categories",
    countCategoriesHint:
      "Count category headers in the list header’s checked / total counter and the sidebar’s badge. Off by default — a header groups the work rather than being work, so a grouped list still finishes at n/n.",
    includeArchivedInCopy: "Include archived in copy",
    includeArchivedInCopyHint:
      "When you copy a list, append its archived items under an “Archived” heading. Off by default — a copy holds just the active items.",
    capitalizeItems: "Capitalise items",
    capitalizeItemsHint:
      "Capitalise the first letter of each item as you type it, so “buy milk” is added as “Buy milk”. Only the first letter changes; the rest is left as typed.",
  },

  transform: {
    blurb:
      "Transform rules rewrite how your items read — turn a reference into a link, swap one phrase for another, or hide something sensitive behind a mask. Your lists are never changed: the stored text, the copy you take, and the editor all keep the original.",
    rulesSection: "Rules",
    empty: "No transforms yet.",
    add: "Add transform",
    editRule: "Edit “{pattern}”",
    removeRule: "Remove “{pattern}”",
    enableRule: "Use “{pattern}”",
    moveUp: "Move “{pattern}” up",
    moveDown: "Move “{pattern}” down",
    orderHint:
      "Rules run top to bottom. Text one rule has already claimed is left alone by the ones below it.",
    invalidBadge: "Invalid pattern",
    newTitle: "New transform",
    editTitle: "Edit transform",
    pattern: "Match",
    patternPlaceholder: "#(\\d+)",
    patternHint:
      "A regular expression. Every match in an item's title and note is replaced. Round brackets capture a piece you can reuse as $1, $2, … in the replacement.",
    patternEmpty: "Enter something to match.",
    patternInvalid: "That isn't a valid regular expression.",
    caseInsensitive: "Ignore case",
    kind: "Replace with",
    kindLink: "Link",
    kindText: "Text",
    kindSensitive: "Sensitive",
    kindLinkHint:
      "Turn each match into a link you can tap. The address may use $1, $2, … from the match.",
    kindTextHint:
      "Replace each match with text. Use $1, $2, … to keep pieces of what matched, and $& for the whole match.",
    kindSensitiveHint:
      "Mask each match so it can't be read over your shoulder. This hides the text on screen only — the original is still stored, still synced, and still copied.",
    url: "Address",
    urlPlaceholder: "https://github.com/owner/repo/issues/$1",
    linkText: "Link text",
    linkTextPlaceholder: "Leave empty to keep the matched text",
    replacement: "Replacement",
    replacementPlaceholder: "Ticket $1",
    mask: "Mask",
    maskEdges: "Keep first and last three — 076****123",
    maskLast4: "Keep the last four — ******4123",
    maskFull: "Hide everything — **********",
    maskFixed: "Fixed width, hides the length — *******",
    sample: "Sample text",
    samplePlaceholder: "Fix #134 before the demo",
    output: "Result",
    outputEmpty: "Type some sample text to try the rule out.",
    outputNoMatch: "Nothing in the sample text matches.",
    insert: "Insert",
    insertAria: "Insert a regular-expression building block",
    token: {
      digit: "Any digit, 0–9",
      word: "Any letter, digit or underscore",
      space: "A space, tab or line break",
      any: "Any single character",
      plus: "One or more of the thing before it",
      star: "Any number of the thing before it, including none",
      optional: "The thing before it, or nothing",
      repeat: "Between two and four of the thing before it",
      set: "Any one of these characters",
      notSet: "Any character except these",
      group: "Capture this piece — reuse it as $1",
      nonCapture: "Group this piece without capturing it",
      alt: "Either the left side or the right side",
      start: "The very start of the text",
      end: "The very end of the text",
      boundary: "The edge of a word",
      escape: "A literal dot, not “any character”",
    },
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
    backendICloud: "iCloud",
    backendFolder: "Local folder",
    backendDropbox: "Dropbox",
    backendGoogleDrive: "Google Drive",
    browserHint:
      "Your lists live in this browser's storage. Nothing leaves this device.",
    icloudConnected:
      "Your lists sync across your Apple devices through iCloud — no account here, no sign-in, nothing leaves Apple's store.",
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
    encryptionStepThrottled: "Waiting out a rate limit…",
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
    unlockStatusAria: "Unlock progress",
    unlockStepDerivingKey: "Checking your passphrase…",
    unlockStepDecrypting: "Decrypting your lists…",
    unlockStepFinalizing: "Unlocking your lists…",
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
