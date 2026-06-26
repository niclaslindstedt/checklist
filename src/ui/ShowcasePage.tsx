// Standalone marketing / showcase homepage, served at `/home` (see
// `app/main.tsx`'s path switch and the `emit-showcase-alias` plugin in
// `vite.config.ts`). It is the page linked from the app's Google OAuth
// consent screen as the "app homepage": it identifies the app, fully
// describes what it does, and explains — with transparency — why the app
// asks for access to Google Drive / Dropbox, then links to the privacy
// policy. It renders for visitors who have not (and need not) log in, since
// the app itself has no account at all. English-only by design, like
// `PrivacyPage`.
import {
  ChecklistIcon,
  CloudIcon,
  CodeIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  ShieldIcon,
  SparklesIcon,
} from "./icons.tsx";

// BASE_URL carries the slot prefix (`/`, `/preview/`, `/branch/`) with a
// trailing slash, so these resolve correctly under every deploy slot.
const APP_URL = import.meta.env.BASE_URL;
const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy/`;
const REPO_URL = "https://github.com/niclaslindstedt/checklist";

export function ShowcasePage() {
  return (
    <div className="h-full overflow-y-auto bg-page-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-fg">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 text-sm leading-relaxed">
        <header className="flex flex-col items-center gap-4 text-center">
          <ChecklistIcon className="h-12 w-12 text-meta" />
          <h1 className="text-2xl font-bold text-fg-bright">checklist</h1>
          <p className="max-w-md text-muted">
            A fast, local-first checklist app that runs entirely in your
            browser, works offline, and needs no account.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <a
              href={APP_URL}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-bold text-page-bg hover:opacity-90"
            >
              Open the app
            </a>
            <a
              href={PRIVACY_URL}
              className="inline-flex items-center gap-1.5 text-sm text-link hover:underline"
            >
              <ShieldIcon className="h-4 w-4" />
              Privacy policy
            </a>
            <a
              href={REPO_URL}
              className="inline-flex items-center gap-1.5 text-sm text-link hover:underline"
            >
              <CodeIcon className="h-4 w-4" />
              Source on GitHub
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </header>

        <Section
          icon={<ChecklistIcon className="h-5 w-5" />}
          title="What it is"
        >
          <p>
            <span className="text-meta">checklist</span> is a progressive web
            app (PWA) for keeping checklists and reusable templates. It is a
            static website with{" "}
            <strong className="text-fg-bright">no backend of its own</strong>:
            everything you create lives in your browser on your device. There is
            no sign-up, no login, and no server that stores your lists. You can
            install it to your home screen and use it completely offline.
          </p>
        </Section>

        <Section
          icon={<SparklesIcon className="h-5 w-5" />}
          title="What you can do with it"
        >
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="text-fg-bright">Capture quickly</strong> — type
              and press Enter to add one item after another without leaving the
              keyboard, tap to check it off, swipe (or right-click on a
              computer) to archive or delete an item — or a whole checklist —
              and optionally sort checked items to the bottom so what&apos;s
              left stands out.
            </li>
            <li>
              <strong className="text-fg-bright">Nest sub-items</strong> — drag
              one item onto another, or use &ldquo;Add sub-item&rdquo; while
              editing, to tuck it underneath; a parent indents its children,
              folds them away, and checking it checks the whole group.
            </li>
            <li>
              <strong className="text-fg-bright">Reuse templates</strong> — turn
              a recurring list into a template and spin up a fresh copy whenever
              you need it.
            </li>
            <li>
              <strong className="text-fg-bright">
                Organise with namespaces
              </strong>{" "}
              — keep separate sets of checklists (for example work and home)
              apart.
            </li>
            <li>
              <strong className="text-fg-bright">
                Group lists into folders
              </strong>{" "}
              — file related checklists into named, collapsible folders within a
              namespace; on the file and cloud backends each folder is a real
              directory of markdown files.
            </li>
            <li>
              <strong className="text-fg-bright">Drag to organise</strong> —
              drag a checklist onto a folder, another namespace, or the archive
              to move it there, or drag a whole folder onto another namespace to
              move it and everything inside it (press and hold on a
              touchscreen).
            </li>
            <li>
              <strong className="text-fg-bright">
                Import and export markdown
              </strong>{" "}
              — copy lists in and out as plain{" "}
              <code className="text-meta">- [ ]</code> markdown.
            </li>
            <li>
              <strong className="text-fg-bright">Search everything</strong> —
              find a checklist, item, note, or nested sub-item across every list
              as you type, with matches highlighted; type plain text (fuzzy by
              default), shell-style wildcards, or a{" "}
              <code className="text-meta">/regex/</code>.
            </li>
            <li>
              <strong className="text-fg-bright">Share a list by link</strong> —
              the payload travels in the URL fragment, so it never touches a
              server.
            </li>
            <li>
              <strong className="text-fg-bright">Give each list a face</strong>{" "}
              — pick an icon and an accent colour for any checklist, shown
              beside its title so you can tell your lists apart at a glance.
            </li>
            <li>
              <strong className="text-fg-bright">Make it yours</strong> — pick a
              theme, a font, a text size, and your language (English or
              Swedish); undo and redo your changes.
            </li>
          </ul>
        </Section>

        <Section
          icon={<DatabaseIcon className="h-5 w-5" />}
          title="Where your data lives"
        >
          <p>
            By default, your checklists are stored only in your browser&apos;s
            local storage on this device and{" "}
            <strong className="text-fg-bright">never leave it</strong>. The app
            makes no third-party network calls in this default mode — the
            project authors never see your lists.
          </p>
          <p>
            If you want your lists on more than one device, you can{" "}
            <em>optionally</em> point storage at a folder on your computer or at
            a cloud backend. That choice — and nothing else — is what the
            permission request below is about.
          </p>
        </Section>

        <Section
          icon={<CloudIcon className="h-5 w-5" />}
          title="Why the app asks for access to your data"
        >
          <p>
            The app requests access to{" "}
            <strong className="text-fg-bright">Google Drive</strong> (and,
            separately, <strong className="text-fg-bright">Dropbox</strong>){" "}
            <strong className="text-fg-bright">
              only if you choose to turn on cloud sync
            </strong>{" "}
            under <em>Settings → Storage</em>. We request it for one purpose:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="text-fg-bright">
                To save and load your checklists
              </strong>{" "}
              so they stay in sync across your own devices.
            </li>
          </ul>
          <p>
            The app uses the narrowest scope that allows this — an{" "}
            <strong className="text-fg-bright">app-specific folder</strong>{" "}
            (Google Drive&apos;s <code className="text-meta">drive.file</code> /
            app-data scope; Dropbox&apos;s app folder). It can read and write
            only the files it created for you. It{" "}
            <strong className="text-fg-bright">
              cannot see the rest of your Drive or Dropbox
            </strong>
            , and it is used for nothing but storing your lists. We do not use
            your data for advertising, analytics, or training, and we never sell
            or share it. You can disconnect at any time, and you can wrap the
            cloud copy in optional end-to-end encryption so the provider only
            ever stores ciphertext.
          </p>
          <p>
            For the full details, read the{" "}
            <a href={PRIVACY_URL} className="text-link hover:underline">
              privacy policy
            </a>
            .
          </p>
        </Section>

        <footer className="flex flex-col items-center gap-2 border-t border-divider pt-6 text-center text-xs text-muted">
          <p>
            <a href={APP_URL} className="text-link hover:underline">
              Open checklist
            </a>{" "}
            ·{" "}
            <a href={PRIVACY_URL} className="text-link hover:underline">
              Privacy policy
            </a>{" "}
            ·{" "}
            <a href={REPO_URL} className="text-link hover:underline">
              Source
            </a>
          </p>
          <p>
            Made by Niclas Lindstedt · MIT-licensed ·
            checklist.niclaslindstedt.se
          </p>
        </footer>
      </main>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold text-fg-bright">
        <span className="text-meta">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
