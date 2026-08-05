import { describe, expect, it } from "vitest";

import {
  destinationFragment,
  destinationUrl,
  parseDestinationFragment,
  resolveUrlDestination,
} from "../../src/app/nav-url.ts";
import type { NavDestination } from "../../src/app/use-nav-history.ts";

const AT = (patch: Partial<NavDestination> = {}): NavDestination => ({
  namespace: "default",
  view: "checklist",
  listId: "abc",
  templateId: null,
  ...patch,
});

describe("destinationFragment", () => {
  it("names the open list, leaving every default unwritten", () => {
    expect(destinationFragment(AT())).toBe("list=abc");
  });

  it("adds the namespace only when it isn't the default one", () => {
    expect(destinationFragment(AT({ namespace: "work" }))).toBe(
      "list=abc&ns=work",
    );
  });

  it("carries an open template and the archive view", () => {
    expect(destinationFragment(AT({ templateId: "t1" }))).toBe(
      "list=abc&template=t1",
    );
    expect(destinationFragment(AT({ view: "archive" }))).toBe(
      "list=abc&view=archive",
    );
  });

  it("escapes ids that need it", () => {
    const fragment = destinationFragment(AT({ listId: "a b&c=d" }));
    expect(parseDestinationFragment(fragment)?.listId).toBe("a b&c=d");
  });
});

describe("parseDestinationFragment", () => {
  it("reads a destination back, with or without the leading #", () => {
    expect(parseDestinationFragment("#list=abc&ns=work&view=archive")).toEqual({
      listId: "abc",
      namespace: "work",
      view: "archive",
    });
    expect(parseDestinationFragment("list=abc")).toEqual({ listId: "abc" });
  });

  it("ignores an empty fragment", () => {
    expect(parseDestinationFragment("")).toBeNull();
    expect(parseDestinationFragment("#")).toBeNull();
  });

  it("ignores a share payload, which carries none of our keys", () => {
    // A gzipped, base64url-encoded checklist — the shape `src/share` produces.
    expect(
      parseDestinationFragment("#H4sIAAAAAAAAA6tWKk5NLsosyUxWsjI0MjZRqgUAy7-i"),
    ).toBeNull();
  });

  it("ignores an unknown view", () => {
    expect(parseDestinationFragment("#list=abc&view=moon")).toEqual({
      listId: "abc",
    });
  });
});

describe("resolveUrlDestination", () => {
  it("fills the gaps from where the app is now", () => {
    expect(
      resolveUrlDestination({ listId: "x" }, AT({ namespace: "work" })),
    ).toEqual(AT({ listId: "x", namespace: "work" }));
  });

  it("takes the fragment's own namespace, view, and template", () => {
    expect(
      resolveUrlDestination(
        { listId: "x", namespace: "home", view: "archive", templateId: "t" },
        AT(),
      ),
    ).toEqual({
      listId: "x",
      namespace: "home",
      view: "archive",
      templateId: "t",
    });
  });

  it("does not inherit an open template the fragment didn't name", () => {
    expect(
      resolveUrlDestination({ listId: "x" }, AT({ templateId: "old" })),
    ).toEqual(AT({ listId: "x" }));
  });
});

describe("destinationUrl", () => {
  it("keeps the path and query the app was loaded with", () => {
    expect(
      destinationUrl({ pathname: "/preview/", search: "?debug=1" }, AT()),
    ).toBe("/preview/?debug=1#list=abc");
  });
});
