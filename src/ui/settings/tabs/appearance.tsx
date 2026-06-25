import { useEffect } from "react";

import { loadAllFontFamilies } from "../../../theme/fonts.ts";
import {
  BORDER_WIDTH_PRESETS,
  COLOR_GROUPS,
  COLOR_LABELS,
  customThemeSeed,
  DARK_THEMES,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DENSITY_PRESETS,
  FAMILY_DEFAULT_THEME,
  FAMILY_LABELS,
  FONT_FAMILIES,
  FONT_SCALES,
  LIGHT_THEMES,
  PRESET_PALETTES,
  RADIUS_PRESETS,
  themeFamily,
  THEME_LABELS,
  type CustomTheme,
  type CustomThemeColors,
  type FontFamilyId,
  type ThemeFamily,
  type ThemePreset,
} from "../../../theme/themes.ts";
import { useT } from "../../../i18n";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { SelectPicker, type SelectOption } from "../../form/index.ts";
import { Field, Section, SegmentedRow, ToggleRow } from "../shared.tsx";

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Descriptive labels for the text-size steps. The framework's
// `FONT_SCALE_PRESETS` ships bare percentages ("90%"); the checklist keeps its
// fuller "Small (90%)" wording, built off the shared `FONT_SCALES` values so
// the set of steps stays in lockstep with the framework.
const FONT_SCALE_LABELS: Record<number, string> = {
  0.9: "Small (90%)",
  1: "Default (100%)",
  1.1: "Large (110%)",
  1.25: "Extra large (125%)",
};

export function AppearanceTab({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
}) {
  const t = useT();
  const isCustom = settings.theme === "custom";

  // The non-default font families load on demand; pull them all in when
  // this tab opens so the font picker's previews render in their real
  // face rather than the fallback stack.
  useEffect(() => {
    loadAllFontFamilies();
  }, []);

  function handleThemeChange(next: ThemePreset) {
    if (next === "custom" && settings.theme !== "custom") {
      // Snapshot the theme that's currently on screen into the Custom
      // controls so the editor opens as a copy of what the user is
      // looking at and the first edit is a tweak, not a reset.
      const prefersLight =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
      onUpdate("customTheme", customThemeSeed(settings.theme, prefersLight));
    }
    onUpdate("theme", next);
  }

  function updateCustom<K extends keyof CustomTheme>(
    key: K,
    value: CustomTheme[K],
  ): void {
    onUpdate("customTheme", { ...settings.customTheme, [key]: value });
  }

  function updateColor(key: keyof CustomThemeColors, value: string): void {
    onUpdate("customTheme", {
      ...settings.customTheme,
      colors: { ...settings.customTheme.colors, [key]: value },
    });
  }

  const family = themeFamily(settings.theme);

  return (
    <>
      <Section title={t("settings.appearance.theme")}>
        <Field label={t("settings.appearance.mode")}>
          <ThemeModeRow
            value={settings.theme}
            onChange={handleThemeChange}
            customColors={settings.customTheme.colors}
          />
          {settings.theme === "system" && (
            <p className="text-xs text-muted">
              {t("settings.appearance.systemNote")}
            </p>
          )}
        </Field>
        {(family === "dark" || family === "light") && (
          <Field label={t("settings.appearance.variant")}>
            <ThemeVariantRow
              value={settings.theme}
              onChange={handleThemeChange}
            />
          </Field>
        )}
      </Section>

      <Section title={t("settings.appearance.font")}>
        <Field label={t("settings.appearance.fontFamily")}>
          <SelectPicker<FontFamilyId>
            value={settings.fontFamily}
            onChange={(v) => onUpdate("fontFamily", v)}
            ariaLabel={t("settings.appearance.fontFamily")}
            options={FONT_FAMILIES.map(
              (f): SelectOption<FontFamilyId> => ({
                value: f.id,
                label: f.label,
                labelStyle: { fontFamily: f.stack },
              }),
            )}
          />
        </Field>
        <Field label={t("settings.appearance.textSize")}>
          <SelectPicker<number>
            value={settings.fontScale}
            onChange={(v) => onUpdate("fontScale", v)}
            ariaLabel={t("settings.appearance.textSize")}
            triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            options={FONT_SCALES.map(
              (scale): SelectOption<number> => ({
                value: scale,
                label: FONT_SCALE_LABELS[scale] ?? `${Math.round(scale * 100)}%`,
              }),
            )}
          />
        </Field>
      </Section>

      <Section title={t("settings.appearance.motion")}>
        <ToggleRow
          label={t("settings.appearance.animateSortChecked")}
          hint={t("settings.appearance.animateSortCheckedHint")}
          checked={settings.animateSortChecked}
          onChange={(v) => onUpdate("animateSortChecked", v)}
        />
      </Section>

      {isCustom && (
        <>
          <Section title={t("settings.appearance.colours")}>
            {COLOR_GROUPS.map((group) => (
              <Field key={group.id} label={group.label}>
                <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-2 gap-y-2.5">
                  {group.keys.map((k) => (
                    <ColorSwatchInput
                      key={k}
                      label={COLOR_LABELS[k]}
                      value={settings.customTheme.colors[k]}
                      onChange={(c) => updateColor(k, c)}
                    />
                  ))}
                </div>
              </Field>
            ))}
          </Section>

          <Section title={t("settings.appearance.shapeMotion")}>
            <Field label={t("settings.appearance.cornerRadius")}>
              <SegmentedRow
                ariaLabel={t("settings.appearance.cornerRadius")}
                value={settings.customTheme.radius}
                options={RADIUS_PRESETS.map((p) => ({
                  value: p,
                  label: capitalise(p),
                }))}
                onChange={(v) => updateCustom("radius", v)}
              />
            </Field>
            <Field label={t("settings.appearance.density")}>
              <SegmentedRow
                ariaLabel={t("settings.appearance.density")}
                value={settings.customTheme.density}
                options={DENSITY_PRESETS.map((p) => ({
                  value: p,
                  label: capitalise(p),
                }))}
                onChange={(v) => updateCustom("density", v)}
              />
            </Field>
            <Field label={t("settings.appearance.borderWidth")}>
              <SegmentedRow
                ariaLabel={t("settings.appearance.borderWidth")}
                value={settings.customTheme.borderWidth}
                options={BORDER_WIDTH_PRESETS.map((p) => ({
                  value: p,
                  label: capitalise(p),
                }))}
                onChange={(v) => updateCustom("borderWidth", v)}
              />
            </Field>
            <ToggleRow
              label={t("settings.appearance.reduceMotion")}
              hint={t("settings.appearance.reduceMotionHint")}
              checked={settings.customTheme.reduceMotion}
              onChange={(v) => updateCustom("reduceMotion", v)}
            />
          </Section>
        </>
      )}
    </>
  );
}

// Per-preset display swatches for the theme picker buttons. `system`
// renders the dark+light combo as a diagonal split; `custom` reads the
// user's palette so the swatch tracks edits live.
function ThemeSwatches({
  theme,
  customColors,
}: {
  theme: ThemePreset;
  customColors?: CustomThemeColors;
}) {
  if (theme === "system") {
    return (
      <span
        aria-hidden
        className="inline-block h-4 w-4 shrink-0 rounded-sm border border-line"
        style={{
          background:
            "linear-gradient(135deg, #1d2027 0 50%, #eef0f2 50% 100%)",
        }}
      />
    );
  }
  const palette =
    theme === "custom"
      ? (customColors ?? DEFAULT_CUSTOM_THEME_COLORS_DARK)
      : PRESET_PALETTES[theme];
  const tones =
    theme === "custom"
      ? [palette.pageBg, palette.surface, palette.accent, palette.flag]
      : [palette.pageBg, palette.surface, palette.fg, palette.accent];
  return (
    <span
      aria-hidden
      className="inline-flex h-4 gap-px overflow-hidden rounded-sm border border-line"
    >
      {tones.map((c, i) => (
        <span
          key={i}
          className="block h-full w-1.5"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

// Mode row — the broad family pick. Selecting the family the user is
// already in is a no-op (keeps the active variant); selecting a new
// family jumps to that family's default preset.
const MODE_ORDER: readonly ThemeFamily[] = [
  "dark",
  "light",
  "system",
  "custom",
];

function ThemeModeRow({
  value,
  onChange,
  customColors,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
  customColors: CustomThemeColors;
}) {
  const activeFamily = themeFamily(value);
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {MODE_ORDER.map((fam) => {
        const active = activeFamily === fam;
        const base =
          "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const cls = active
          ? "border-accent bg-surface-2 text-fg-bright"
          : "border-line bg-transparent text-muted opacity-60 hover:border-accent hover:opacity-100";
        return (
          <button
            key={fam}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={FAMILY_LABELS[fam]}
            onClick={() => {
              if (active) return;
              onChange(FAMILY_DEFAULT_THEME[fam]);
            }}
            className={`${base} ${cls}`}
          >
            <ThemeSwatches
              theme={FAMILY_DEFAULT_THEME[fam]}
              customColors={customColors}
            />
            <span>{FAMILY_LABELS[fam]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Variant row — appears only for the Dark / Light families. Lists every
// preset in that family with the same swatch + label pattern.
function ThemeVariantRow({
  value,
  onChange,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
}) {
  const family = themeFamily(value);
  const variants =
    family === "dark" ? DARK_THEMES : family === "light" ? LIGHT_THEMES : null;
  if (!variants) return null;
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {variants.map((theme) => {
        const active = value === theme;
        const base =
          "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const cls = active
          ? "border-accent bg-surface-2 text-fg-bright"
          : "border-line bg-transparent text-muted opacity-60 hover:border-accent hover:opacity-100";
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={THEME_LABELS[theme]}
            onClick={() => onChange(theme)}
            className={`${base} ${cls}`}
          >
            <ThemeSwatches theme={theme} />
            <span>{THEME_LABELS[theme]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Native colour input captioned beneath the swatch. Native is the right
// call: 18 colour controls want the OS hex entry, and the swatch itself
// doubles as the trigger.
function ColorSwatchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 text-xs text-muted">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-full cursor-pointer rounded border border-line bg-transparent p-0"
      />
      <span className="leading-tight">{label}</span>
    </label>
  );
}
