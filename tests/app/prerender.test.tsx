// @vitest-environment jsdom
import { act } from "@testing-library/preact";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  findReactStyleAttribute,
  renderStaticRoute,
  renderStaticRoutes,
} from "../../src/app/prerender.tsx";
import { StaticRouteView } from "../../src/app/StaticRouteView.tsx";
import {
  STATIC_ROUTES,
  staticRouteFor,
  type StaticRoute,
} from "../../src/app/static-routes.ts";

describe("staticRouteFor", () => {
  const cases: [string, StaticRoute | null][] = [
    ["/home", "home"],
    ["/home/", "home"],
    ["/privacy", "privacy"],
    ["/privacy/", "privacy"],
    // Deploy slots nest each page one segment deeper.
    ["/preview/home/", "home"],
    ["/branch/privacy/", "privacy"],
    // The app itself, and anything else, renders the app.
    ["/", null],
    ["/preview/", null],
    ["/list/abc", null],
  ];

  for (const [pathname, expected] of cases) {
    it(`maps ${pathname} to ${expected ?? "the app"}`, () => {
      expect(staticRouteFor(pathname)).toBe(expected);
    });
  }

  it("does not mistake a longer word ending in the route name", () => {
    expect(staticRouteFor("/not-home")).toBeNull();
    expect(staticRouteFor("/data-privacy")).toBeNull();
  });
});

// Whether `preact/compat`'s prop normalisation ran is a property of which
// modules the rendering process happened to load, so `renderStaticRoute`
// checks its own output rather than trusting it. Under Vitest compat is always
// loaded, which means the check can never fire here — so the rule is tested
// directly instead. (The wiring is covered where it matters: the build fails
// outright if the normalisation is missing.)
describe("findReactStyleAttribute", () => {
  it("catches the SVG props preact/compat is responsible for dashing", () => {
    expect(findReactStyleAttribute('<svg strokeWidth="2">')).toBe(
      "strokeWidth",
    );
    expect(findReactStyleAttribute('<path strokeLinecap="round">')).toBe(
      "strokeLinecap",
    );
    expect(findReactStyleAttribute('<path fillRule="evenodd">')).toBe(
      "fillRule",
    );
  });

  it("passes markup that already uses DOM attribute names", () => {
    expect(
      findReactStyleAttribute('<svg stroke-width="2" stroke-linecap="round">'),
    ).toBeNull();
    expect(findReactStyleAttribute('<div class="x">hi</div>')).toBeNull();
  });

  it("leaves the SVG attributes that are genuinely camelCase alone", () => {
    // These are camelCase in the DOM too, and compat excludes each one; a
    // guard that flagged them would fail the build on correct markup.
    for (const attr of [
      'viewBox="0 0 24 24"',
      'textLength="10"',
      'markerWidth="4"',
      'clipPathUnits="userSpaceOnUse"',
      'preserveAspectRatio="none"',
    ]) {
      expect(findReactStyleAttribute(`<svg ${attr}>`)).toBeNull();
    }
  });
});

describe("prerendered markup", () => {
  it("renders every static route", () => {
    const all = renderStaticRoutes();
    expect(Object.keys(all).sort()).toEqual([...STATIC_ROUTES].sort());
  });

  it("puts the showcase page's real copy in the HTML", () => {
    const html = renderStaticRoute("home");
    // The two things Google's OAuth review reads the page for: what the app
    // does, and why it asks for access. If either heading stops being
    // prerendered, the page is back to being a blank shell for a crawler.
    expect(html).toContain("What you can do with it");
    expect(html).toContain("Why the app asks for access to your data");
  });

  it("puts the privacy policy's real copy in the HTML", () => {
    const html = renderStaticRoute("privacy");
    expect(html).toContain("Privacy policy");
    expect(html).toContain("Last updated:");
  });

  for (const route of STATIC_ROUTES) {
    it(`${route} renders one root element and leaks no placeholders`, () => {
      const html = renderStaticRoute(route);
      expect(html.startsWith("<div")).toBe(true);
      expect(html.endsWith("</div>")).toBe(true);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("[object Object]");
    });

    it(`${route} renders DOM attribute names, not React's`, () => {
      const html = renderStaticRoute(route);
      // Not a style preference: hydration does *not* re-apply attributes to
      // nodes it adopts (verified — text and missing elements get corrected,
      // attributes never do), so anything wrong here is wrong for the life of
      // the page. `renderStaticRoute` fails the build over it; this pins the
      // shape the guard is protecting.
      expect(html).toContain('stroke-width="2"');
      expect(html).not.toContain("strokeWidth=");
      expect(html).toContain('class="');
      expect(html).not.toContain("className=");
    });

    // The client adopts this markup rather than rebuilding it, which is only
    // safe while the build-time and client renders agree — so hydrate through
    // the same `hydrateRoot` call `main.tsx` makes and assert Preact found
    // nothing to correct.
    //
    // Worth knowing what this does and doesn't cover: Preact hydration
    // rewrites mismatched *text* and creates *missing* elements, so those
    // divergences fail here. It ignores attribute values and leaves *extra*
    // DOM in place, so those cannot — attributes are covered by the test above
    // and by the build guard instead.
    it(`${route} hydrates without Preact patching the DOM`, () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.innerHTML = renderStaticRoute(route);
      const before = container.innerHTML;

      act(() => {
        hydrateRoot(container, <StaticRouteView route={route} />);
      });

      expect(container.innerHTML).toBe(before);
      container.remove();
    });
  }
});
