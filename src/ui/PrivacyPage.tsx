// Standalone privacy policy, served at `/privacy` (see `app/main.tsx`'s
// path switch and the `emit-privacy-alias` plugin in `vite.config.ts`).
// The checklist is local-first — by default no backend, nothing to sign up
// for, no analytics — but it also ships optional storage backends (a local folder,
// and Dropbox) that send list data to a provider only when
// the user explicitly connects one, so this policy covers both cases. It is
// English-only by design (a legal page, not chrome), matching budget's
// PrivacyPage.
//
// The phone and desktop apps carry their own copy of this page, and it names
// neither the website's address nor the repository (`IS_WEBSITE` in
// `src/build-env.ts`): there it says "the app", and Contact is the company's
// support address rather than GitHub.
//
// The phone app offers no Dropbox (`DROPBOX_BUILT`), so its copy names none:
// there the optional sync is the user's own iCloud on an iPhone or iPad. Nor
// does it offer a local folder (`LOCAL_FOLDER_BUILT`), so its copy leaves that
// backend out too. And it names no other edition of itself — no website, no
// web host and its server logs, no browser, no PWA, no localStorage: it is
// true of the phone app alone. Everything the app runs comes inside the
// download, it sends nothing when it starts, and the only network traffic is
// the iCloud sync the reader turns on.
//
// Every gate here tests the raw `__NATIVE__` / `__SHELL_BUILD__` defines at
// the use site rather than a constant derived from them (`IS_WEBSITE`,
// `DROPBOX_BUILT`, …): what one build's copy says has to leave the other
// builds' bundles, not ride along in them as dead code.
import { APP_NAME } from "../build-env.ts";
import { ArrowLeftIcon } from "./icons.tsx";

const SUPPORT_EMAIL = "support@agilator.se";

// Last meaningful change to the policy text below. Bump this whenever the
// wording is edited — it renders verbatim at the top of the page and is
// the only line readers have to look at to see how fresh the policy is.
const LAST_UPDATED = "2026-10-18";

export function PrivacyPage() {
  return (
    <div className="h-full overflow-y-auto bg-page-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-fg">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back to {APP_NAME}
          </a>
          <h1 className="text-lg font-bold text-fg-bright">Privacy policy</h1>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Summary">
          <p>
            <span className="text-meta">{APP_NAME}</span> is a local-first
            checklist app
            {__NATIVE__ ? (
              <>
                . The app and every file it runs come inside the download, and
                it runs entirely on your device: it sends nothing when it
                starts, and the only network traffic it ever causes is the sync
                you turn on yourself.
              </>
            ) : !__SHELL_BUILD__ ? (
              <>
                {" "}
                served as a static site at{" "}
                <span className="text-path">checklist.niclaslindstedt.se</span>.
                It runs entirely in your browser.
              </>
            ) : (
              <>. It runs entirely on your device.</>
            )}{" "}
            There is no {__NATIVE__ ? "server" : "backend"} of our own, nothing
            to sign up for, no cookies, and no analytics or tracking. By default
            your lists are stored only on your device and never leave it.{" "}
            {!__NATIVE__ ? (
              <>
                You may optionally connect a cloud backend (Dropbox) to sync
                your lists across your own devices — in that case, and only
                then, your lists are sent to that one provider at your explicit
                request.
              </>
            ) : (
              <>
                On an iPhone or iPad you may optionally keep your lists in your
                own iCloud to sync them across your Apple devices — in that
                case, and only then, they are kept by Apple under your Apple
                Account.
              </>
            )}{" "}
            The project authors never receive your lists in any configuration.
          </p>
        </Section>

        <Section title="What the app stores">
          <p>
            {__NATIVE__ ? (
              <>
                On your device, inside the app&apos;s own private storage, the
                app keeps:
              </>
            ) : !__SHELL_BUILD__ ? (
              <>
                On your device, inside your browser&apos;s{" "}
                <code className="text-meta">localStorage</code> for the origin{" "}
                <span className="text-path">checklist.niclaslindstedt.se</span>,
                the app keeps:
              </>
            ) : (
              <>
                On your device, inside the app&apos;s own{" "}
                <code className="text-meta">localStorage</code>, the app keeps:
              </>
            )}
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Your checklist items and their checked / archived state (when the
              default <em>This device</em> backend is selected).
            </li>
            <li>
              Per-device preferences — your chosen theme, font, text size, and
              other appearance settings.
            </li>
            {!__NATIVE__ ? (
              <li>
                Which storage backend you&apos;ve chosen, and — if you&apos;ve
                connected Dropbox — the OAuth access and refresh tokens for that
                provider. These tokens grant access only to the app&apos;s own
                folder, never your whole account, and never leave your device
                except to authenticate with that provider.
              </li>
            ) : (
              <li>Which storage backend you&apos;ve chosen.</li>
            )}
          </ul>
          {__NATIVE__ ? (
            <p>
              This data is stored as plain JSON on your own device. Deleting the
              app erases it permanently — if you have not turned on iCloud,
              there is no copy elsewhere to restore from.
            </p>
          ) : (
            <p>
              This data is stored as plain JSON on your own device. Clearing
              your browser&apos;s site data for this origin erases it
              permanently — if you have not connected a cloud backend, there is
              no copy elsewhere to restore from.
            </p>
          )}
        </Section>

        <Section title="Storage backends">
          <p>
            Under <strong className="text-fg-bright">Settings → Storage</strong>{" "}
            you choose where your lists are saved:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            {__NATIVE__ ? (
              <li>
                <strong className="text-fg-bright">This device</strong> (the
                default) — lists stay in the app&apos;s own storage on this
                device and are never transmitted anywhere.
              </li>
            ) : (
              <li>
                <strong className="text-fg-bright">This device</strong> (the
                default) — lists stay in your browser&apos;s{" "}
                <code className="text-meta">localStorage</code> and are never
                transmitted anywhere.
              </li>
            )}
            {!__NATIVE__ && (
              <li>
                <strong className="text-fg-bright">Local folder</strong> — lists
                are written as files to a folder you pick on this device, using
                the browser&apos;s File System Access API. The data stays on
                your device; the folder-access grant is remembered in IndexedDB.
              </li>
            )}
            {!__NATIVE__ ? (
              <li>
                <strong className="text-fg-bright">Dropbox</strong> — only when
                you explicitly connect it, your lists are stored in your Dropbox
                (in an app-scoped folder) so they sync across your own devices.
                Connecting sends you to Dropbox&apos;s own consent screen; the
                app requests access to its own folder only. Your data is then
                also subject to Dropbox&apos;s privacy policy. You can
                disconnect at any time.
              </li>
            ) : (
              <li>
                <strong className="text-fg-bright">iCloud</strong> (on an iPhone
                or iPad) — only when you choose it, your lists are kept in
                Apple&apos;s iCloud key-value store under the Apple Account
                you&apos;re signed in with, so they sync across your own Apple
                devices. The system does the syncing; the app signs in to
                nothing. Your data is then also subject to Apple&apos;s privacy
                policy.
              </li>
            )}
          </ul>
          <p>
            Optionally, you can turn on{" "}
            <strong className="text-fg-bright">encryption</strong> with a
            passphrase: your lists are wrapped in an AES-GCM envelope before
            they are saved — on this device and in the cloud — so a cloud
            provider only ever sees ciphertext. The passphrase is{" "}
            <strong className="text-fg-bright">
              never stored or transmitted
            </strong>
            ; it lives in memory for the session only, and there is no recovery
            if you forget it.
          </p>
        </Section>

        <Section title="Network requests">
          {__NATIVE__ ? (
            <p>
              With no sync turned on, the app makes no network request at all —
              not when it starts, and not while you use it. Everything it runs
              (its code, fonts, and icons) comes inside the download, so it
              works fully offline. The only network traffic is the sync you turn
              on: iCloud, through your own Apple Account — and even then the
              system syncs your lists with Apple; the app itself sends them
              nowhere. No analytics scripts, error-reporting services, or
              advertising networks are ever loaded.
            </p>
          ) : (
            <p>
              With the default <em>This device</em> backend the app makes no
              third-party network calls. The only requests your browser makes
              are to fetch the app&apos;s own static files (HTML, JavaScript,
              CSS, fonts, and icons) from its origin, and once loaded it works
              fully offline as an installed PWA.{" "}
              {!__NATIVE__ ? (
                <>
                  The one exception is the cloud backends: if — and only if —
                  you connect Dropbox, the app talks to that provider&apos;s API
                  to read and write your lists.
                </>
              ) : (
                <>
                  If you choose iCloud, the system syncs your lists with Apple;
                  the app itself sends them nowhere.
                </>
              )}{" "}
              No fonts, analytics scripts, error-reporting services, or
              advertising networks are ever loaded.
            </p>
          )}
        </Section>

        <Section title="Cookies">
          {__NATIVE__ ? (
            <p>
              The app sets no cookies. Everything it keeps is in its own storage
              on the device and, if you turn it on, in your iCloud.
            </p>
          ) : (
            <p>
              The app sets no cookies. All persistence uses{" "}
              <code className="text-meta">localStorage</code>.
            </p>
          )}
        </Section>

        <Section title={__NATIVE__ ? "Analytics" : "Web analytics"}>
          <p>
            None. The app does not load any analytics or behavioral-tracking
            SDK, and the project authors collect no usage statistics from it.
          </p>
        </Section>

        <Section title="Server logs">
          {__NATIVE__ ? (
            <p>
              There are none. The app has no server of ours to talk to:
              everything it runs comes inside the download, so opening it sends
              no request, and there is nothing to log.
            </p>
          ) : (
            <p>
              The website is served by{" "}
              <strong className="text-fg-bright">GitHub Pages</strong>. GitHub
              may collect standard request metadata (IP address, user agent,
              request path) for operating the service. This is covered by{" "}
              <a
                href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                className="text-link hover:underline"
              >
                GitHub&apos;s privacy statement
              </a>
              . The app from the App Store or Google Play carries its own copy
              of the site and serves it on the device, so opening it sends no
              such request. The project authors do not run an additional logging
              service.
            </p>
          )}
        </Section>

        <Section title="Children">
          <p>
            The app is a general-purpose checklist tool and is not directed at
            children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            {!(__NATIVE__ || __SHELL_BUILD__) &&
              "Material changes are tracked in the public commit history of the source repository. "}
            The <em>Last updated</em> date at the top of this page reflects the
            most recent edit. Should a future version add another optional
            feature that sends data anywhere, this policy will be updated to
            describe it before that feature ships enabled.
          </p>
          <p>
            The store listings link to{" "}
            <a
              href="https://apps.agilator.se/checklist/privacy/"
              className="text-link hover:underline"
            >
              apps.agilator.se/checklist/privacy
            </a>
            , which describes the same app and is kept in step with this page.
          </p>
        </Section>

        <Section title="Contact">
          {!(__NATIVE__ || __SHELL_BUILD__) ? (
            <WebsiteContact />
          ) : (
            <p>
              For questions about the app or this policy, and for security
              reports, write to{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-link hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          )}
        </Section>
      </article>
    </div>
  );
}

// The website's contact: the repository's advisories and issues.
function WebsiteContact() {
  return (
    <p>
      For security reports, see{" "}
      <a
        href="https://github.com/niclaslindstedt/checklist/security/advisories/new"
        className="text-link hover:underline"
      >
        GitHub Security Advisories
      </a>
      . For everything else, open an issue at{" "}
      <a
        href="https://github.com/niclaslindstedt/checklist/issues"
        className="text-link hover:underline"
      >
        github.com/niclaslindstedt/checklist
      </a>
      .
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-fg-bright">
        {title}
      </h2>
      {children}
    </section>
  );
}
