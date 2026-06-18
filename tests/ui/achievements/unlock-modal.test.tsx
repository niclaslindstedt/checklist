// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AchievementUnlockModal } from "../../../src/ui/achievements/AchievementUnlockModal.tsx";

afterEach(cleanup);

describe("AchievementUnlockModal", () => {
  it("renders as a centered card instead of the full-screen mobile sheet", () => {
    // The unlock-notification modal lists only the new unlocks — short
    // content that opens no soft keyboard. It must render as a compact
    // centered card on every viewport rather than filling the screen on
    // mobile, where the dismiss button would sit in a far-away footer.
    render(
      <AchievementUnlockModal
        open
        unseenIds={["firstSteps"]}
        onClose={() => {}}
      />,
    );
    const wrapper = screen.getByRole("dialog").parentElement;
    expect(wrapper?.className).toContain("items-center");
    expect(wrapper?.className).not.toContain("items-stretch");
  });
});
