// Standalone privacy policy, served at `/privacy` (see `app/main.tsx`'s
// path switch and the `emit-privacy-alias` plugin in `vite.config.ts`).
// The checklist is local-only today — no backend, no accounts, no sync,
// no analytics — so this policy is deliberately short and says exactly
// that. It is English-only by design (a legal page, not chrome), matching
// budget's PrivacyPage.
import { ArrowLeftIcon } from "./icons.tsx";

// Last meaningful change to the policy text below. Bump this whenever the
// wording is edited — it renders verbatim at the top of the page and is
// the only line readers have to look at to see how fresh the policy is.
const LAST_UPDATED = "2026-06-15";

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
            Back to checklist
          </a>
          <h1 className="text-lg font-bold text-fg-bright">Privacy policy</h1>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Summary">
          <p>
            <span className="text-meta">checklist</span> is a local-first
            checklist app served as a static site at{" "}
            <span className="text-path">checklist.niclaslindstedt.se</span>. It
            runs entirely in your browser. There is no backend, no account, no
            server-side sync, no cookies, and no analytics or tracking. Your
            lists never leave your device, and the project authors never receive
            them.
          </p>
        </Section>

        <Section title="What the app stores">
          <p>
            All of your data is kept inside your browser&apos;s{" "}
            <code className="text-meta">localStorage</code> for the origin{" "}
            <span className="text-path">checklist.niclaslindstedt.se</span>:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your checklist items and their checked / archived state.</li>
            <li>
              Per-device preferences — your chosen theme, font, text size, and
              other appearance settings.
            </li>
          </ul>
          <p>
            This data is stored as plain JSON on your own device. It is not
            transmitted anywhere. Clearing your browser&apos;s site data for
            this origin erases it permanently — there is no copy on a server to
            restore from.
          </p>
        </Section>

        <Section title="Network requests">
          <p>
            The app makes no third-party network calls. The only requests your
            browser makes are to fetch the app&apos;s own static files (HTML,
            JavaScript, CSS, fonts, and icons) from its origin. No fonts,
            analytics scripts, error-reporting services, or advertising networks
            are loaded. Once the app has loaded, it works fully offline as an
            installed PWA.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            The app sets no cookies. All persistence uses{" "}
            <code className="text-meta">localStorage</code>.
          </p>
        </Section>

        <Section title="Web analytics">
          <p>
            None. The app does not load any analytics or behavioural-tracking
            SDK, and the project authors collect no usage statistics from it.
          </p>
        </Section>

        <Section title="Server logs">
          <p>
            The static bundle is served by{" "}
            <strong className="text-fg-bright">GitHub Pages</strong>. GitHub may
            collect standard request metadata (IP address, user agent, request
            path) for operating the service. This is covered by{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              className="text-link hover:underline"
            >
              GitHub&apos;s privacy statement
            </a>
            . The project authors do not run an additional logging service.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The app is a general-purpose checklist tool and is not directed at
            children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            Material changes are tracked in the public commit history of the
            source repository. The <em>Last updated</em> date at the top of this
            page reflects the most recent edit. Should a future version add an
            optional feature that sends data anywhere (for example, a cloud
            storage backend you explicitly connect), this policy will be updated
            to describe it before that feature ships enabled.
          </p>
        </Section>

        <Section title="Contact">
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
        </Section>
      </article>
    </div>
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
