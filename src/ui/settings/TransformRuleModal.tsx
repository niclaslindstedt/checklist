import { useId, useMemo, useRef, useState } from "react";

import {
  applyTransforms,
  transformRuleError,
  type MaskStyle,
  type TransformKind,
  type TransformRule,
} from "../../domain/transforms.ts";
import { useT } from "../../i18n";
import { Button, Checkbox, SelectPicker } from "../form/index.ts";
import { RegexIcon } from "../icons.tsx";
import { renderSegment } from "../markdown/renderTransformed.tsx";
import { Modal } from "../Modal.tsx";
import { SegmentedRow } from "./shared.tsx";
import { RegexHelper } from "./RegexHelper.tsx";

// The editor a transform rule is written in: what to match, what to turn it
// into, and — below the fold — a sample line with the rule already applied to
// it. The preview is the point. A regular expression is easy to get subtly
// wrong and impossible to check by reading, so the modal renders the draft
// rule against the user's own sample with exactly the code the checklist row
// uses, which means what shows here is what the list will show.
//
// The rule is edited as a local draft and only handed back on Save, so
// backing out leaves the settings untouched.

const INPUT_CLASS =
  "w-full rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg-bright outline-none focus:border-accent";

type Props = {
  /** The rule being edited; a freshly-minted one for "Add transform". */
  rule: TransformRule;
  onSave: (rule: TransformRule) => void;
  onClose: () => void;
};

export function TransformRuleModal({ rule, onSave, onClose }: Props) {
  const t = useT();
  const headingId = useId();
  const patternRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<TransformRule>(rule);
  const [sample, setSample] = useState("");
  const set = <K extends keyof TransformRule>(
    key: K,
    value: TransformRule[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const error = transformRuleError(draft.pattern, draft.caseInsensitive);

  // The preview: the draft rule applied to the sample, rendered through the
  // same segment renderer the list uses. A broken pattern previews nothing.
  const preview = useMemo(() => {
    if (error || sample === "") return null;
    const segs = applyTransforms(sample, [{ ...draft, enabled: true }]);
    const changed =
      segs.length > 1 || segs[0]?.kind !== "text" || segs[0].text !== sample;
    return { segs, changed };
  }, [draft, sample, error]);

  const maskOptions = [
    { value: "edges" as const, label: t("settings.transform.maskEdges") },
    { value: "last4" as const, label: t("settings.transform.maskLast4") },
    { value: "full" as const, label: t("settings.transform.maskFull") },
    { value: "fixed" as const, label: t("settings.transform.maskFixed") },
  ];

  const kindHint =
    draft.kind === "link"
      ? t("settings.transform.kindLinkHint")
      : draft.kind === "text"
        ? t("settings.transform.kindTextHint")
        : t("settings.transform.kindSensitiveHint");

  const save = () => {
    if (error) return;
    onSave({ ...draft, pattern: draft.pattern.trim() });
    onClose();
  };

  return (
    <Modal open onClose={onClose} labelledBy={headingId} size="max-w-lg">
      <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain p-5">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-base font-semibold text-fg-bright"
        >
          <RegexIcon className="h-5 w-5 text-accent" />
          {rule.pattern === ""
            ? t("settings.transform.newTitle")
            : t("settings.transform.editTitle")}
        </h2>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("settings.transform.pattern")}
          </span>
          <div className="flex items-start gap-2">
            <input
              ref={patternRef}
              type="text"
              value={draft.pattern}
              onChange={(e) => set("pattern", e.currentTarget.value)}
              placeholder={t("settings.transform.patternPlaceholder")}
              aria-label={t("settings.transform.pattern")}
              aria-invalid={error !== null}
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              className={INPUT_CLASS}
            />
            <RegexHelper
              inputRef={patternRef}
              value={draft.pattern}
              onChange={(next) => set("pattern", next)}
            />
          </div>
          {error === "pattern-invalid" && (
            <span className="text-xs text-danger">
              {t("settings.transform.patternInvalid")}
            </span>
          )}
          <span className="text-xs text-muted">
            {t("settings.transform.patternHint")}
          </span>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={draft.caseInsensitive}
              onChange={(next) => set("caseInsensitive", next)}
              ariaLabel={t("settings.transform.caseInsensitive")}
              size="sm"
            />
            <span className="text-sm text-fg">
              {t("settings.transform.caseInsensitive")}
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("settings.transform.kind")}
          </span>
          <SegmentedRow<TransformKind>
            value={draft.kind}
            ariaLabel={t("settings.transform.kind")}
            options={[
              { value: "link", label: t("settings.transform.kindLink") },
              { value: "text", label: t("settings.transform.kindText") },
              {
                value: "sensitive",
                label: t("settings.transform.kindSensitive"),
              },
            ]}
            onChange={(next) => set("kind", next)}
          />
          <span className="text-xs text-muted">{kindHint}</span>
        </div>

        {draft.kind === "link" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                {t("settings.transform.url")}
              </span>
              <input
                type="text"
                value={draft.replacement}
                onChange={(e) => set("replacement", e.currentTarget.value)}
                placeholder={t("settings.transform.urlPlaceholder")}
                autoCapitalize="off"
                autoCorrect="off"
                spellcheck={false}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                {t("settings.transform.linkText")}
              </span>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => set("label", e.currentTarget.value)}
                placeholder={t("settings.transform.linkTextPlaceholder")}
                autoCapitalize="off"
                autoCorrect="off"
                spellcheck={false}
                className={INPUT_CLASS}
              />
            </label>
          </>
        )}

        {draft.kind === "text" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">
              {t("settings.transform.replacement")}
            </span>
            <input
              type="text"
              value={draft.replacement}
              onChange={(e) => set("replacement", e.currentTarget.value)}
              placeholder={t("settings.transform.replacementPlaceholder")}
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              className={INPUT_CLASS}
            />
          </label>
        )}

        {draft.kind === "sensitive" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">
              {t("settings.transform.mask")}
            </span>
            <SelectPicker<MaskStyle>
              value={draft.mask}
              options={maskOptions}
              onChange={(next) => set("mask", next)}
              ariaLabel={t("settings.transform.mask")}
            />
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("settings.transform.sample")}
          </span>
          <textarea
            value={sample}
            onChange={(e) => setSample(e.currentTarget.value)}
            placeholder={t("settings.transform.samplePlaceholder")}
            rows={2}
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            className={`${INPUT_CLASS} min-h-16 resize-none`}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("settings.transform.output")}
          </span>
          <output className="min-h-9 rounded border border-line bg-surface-3 px-2 py-1.5 text-sm break-words text-fg">
            {preview
              ? preview.segs.map((seg, i) => renderSegment(seg, `p${i}`))
              : null}
          </output>
          {!preview && (
            <span className="text-xs text-muted">
              {t("settings.transform.outputEmpty")}
            </span>
          )}
          {preview && !preview.changed && (
            <span className="text-xs text-muted">
              {t("settings.transform.outputNoMatch")}
            </span>
          )}
        </div>
      </div>

      <footer className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom)+10px)] sm:pb-3">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={save} disabled={error !== null}>
          {t("common.save")}
        </Button>
      </footer>
    </Modal>
  );
}
