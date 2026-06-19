// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ModalBusProvider } from "../../../src/ui/ModalBusProvider.tsx";
import {
  AchievementsContext,
  type AchievementsContextValue,
} from "../../../src/ui/achievements/achievements-context.ts";
import { TrophyButton } from "../../../src/ui/achievements/TrophyButton.tsx";

afterEach(cleanup);

function renderTrophy(value: AchievementsContextValue) {
  return render(
    <ModalBusProvider>
      <AchievementsContext.Provider value={value}>
        <TrophyButton />
      </AchievementsContext.Provider>
    </ModalBusProvider>,
  );
}

describe("TrophyButton", () => {
  it("renders the menu row when achievements are enabled", () => {
    renderTrophy({ unseenCount: 0, enabled: true });
    expect(screen.getByRole("menuitem")).toBeTruthy();
  });

  it("shows the unseen-count badge when there are new unlocks", () => {
    renderTrophy({ unseenCount: 3, enabled: true });
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("colours the glyph when there are new unlocks", () => {
    renderTrophy({ unseenCount: 2, enabled: true });
    expect(
      screen.getByRole("menuitem").querySelector(".text-flag"),
    ).toBeTruthy();
  });

  it("greys the glyph out when nothing is unacknowledged", () => {
    renderTrophy({ unseenCount: 0, enabled: true });
    const row = screen.getByRole("menuitem");
    expect(row.querySelector(".text-flag")).toBeNull();
    expect(row.querySelector(".text-muted\\/50")).toBeTruthy();
  });

  it("renders nothing when achievements are disabled", () => {
    const { container } = renderTrophy({ unseenCount: 2, enabled: false });
    expect(container.querySelector("button")).toBeNull();
  });
});
