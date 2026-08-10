import { useState } from "react";

import {
  compilePattern,
  namespaceTransforms,
  setNamespaceTransforms,
  type TransformRule,
} from "../../../domain/transforms.ts";
import { useT, type MessageKey, type TFunction } from "../../../i18n";
import {
  DEFAULT_MASK_STYLE,
  DEFAULT_TRANSFORM_KIND,
} from "../../../settings/store.ts";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import type { Namespace } from "../../../storage/namespaces.ts";
import {
  Button,
  Checkbox,
  SelectPicker,
  type SelectOption,
} from "../../form/index.ts";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../../icons.tsx";
import { Field, Section } from "../shared.tsx";
import { TransformRuleModal } from "../TransformRuleModal.tsx";

// The Transform tab: the user's list of display-transform rules, in the order
// they run. Each row is a rule — its pattern, what it turns a match into, and
// the switches to park it, move it, edit it, or drop it. Writing a rule
// happens in `TransformRuleModal`, which previews it against sample text.
//
// Rules belong to one namespace, so the tab edits a single namespace's list at
// a time — the active one when the dialog opens. With more than one namespace
// around, a picker switches which list is on screen, so the rules for Home can
// be written without leaving Work.
//
// The rules are edited on the settings draft like every other tab, so nothing
// reaches the document until the dialog is saved.

function blankRule(): TransformRule {
  return {
    // A rule is identified by an opaque id rather than its pattern, so
    // editing the pattern still edits the same rule.
    id: crypto.randomUUID(),
    pattern: "",
    caseInsensitive: false,
    kind: DEFAULT_TRANSFORM_KIND,
    replacement: "",
    label: "",
    mask: DEFAULT_MASK_STYLE,
    enabled: true,
  };
}

export function TransformTab({
  settings,
  onUpdate,
  namespaces,
  activeNamespace,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
  /** Every namespace on the device, for the "whose rules am I editing" picker. */
  namespaces: readonly Namespace[];
  /** The namespace the app is in — the list the tab opens on. */
  activeNamespace: string;
}) {
  const t = useT();
  // Which namespace's rules are on screen. Starts on the active one and is
  // the user's own cursor from there; it isn't persisted, so re-opening the
  // dialog lands back on the namespace they're actually working in. A pick
  // that has since gone away (the namespace was deleted from the side menu)
  // falls back to the active one rather than editing a list nothing reads.
  const [picked, setPicked] = useState(activeNamespace);
  const slug = namespaces.some((n) => n.slug === picked)
    ? picked
    : activeNamespace;
  const rules = namespaceTransforms(settings.transforms, slug);
  // The rule open in the editor. A rule not yet in the list is an add.
  const [editing, setEditing] = useState<TransformRule | null>(null);

  const write = (next: readonly TransformRule[]) =>
    onUpdate(
      "transforms",
      setNamespaceTransforms(settings.transforms, slug, next),
    );

  const upsert = (rule: TransformRule) => {
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx === -1) {
      write([...rules, rule]);
      return;
    }
    write(rules.map((r) => (r.id === rule.id ? rule : r)));
  };

  const remove = (id: string) => write(rules.filter((r) => r.id !== id));

  const move = (idx: number, delta: number) => {
    const to = idx + delta;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    const [moved] = next.splice(idx, 1);
    next.splice(to, 0, moved!);
    write(next);
  };

  return (
    <>
      <p className="mb-3 text-xs text-muted">{t("settings.transform.blurb")}</p>

      <Section title={t("settings.transform.rulesSection")}>
        {namespaces.length > 1 && (
          <Field
            label={t("settings.transform.namespaceLabel")}
            hint={t("settings.transform.namespaceHint")}
          >
            <SelectPicker<string>
              value={slug}
              onChange={setPicked}
              ariaLabel={t("settings.transform.namespaceLabel")}
              options={namespaces.map((ns): SelectOption<string> => {
                const count = namespaceTransforms(
                  settings.transforms,
                  ns.slug,
                ).length;
                return {
                  value: ns.slug,
                  label: ns.name,
                  hint:
                    count > 0
                      ? t(
                          count === 1
                            ? "settings.transform.namespaceCountOne"
                            : "settings.transform.namespaceCountOther",
                          { count },
                        )
                      : undefined,
                };
              })}
            />
          </Field>
        )}

        {rules.length === 0 ? (
          <p className="text-sm text-muted">{t("settings.transform.empty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rules.map((rule, idx) => (
              <RuleRow
                key={rule.id}
                t={t}
                rule={rule}
                first={idx === 0}
                last={idx === rules.length - 1}
                onToggle={(enabled) => upsert({ ...rule, enabled })}
                onEdit={() => setEditing(rule)}
                onRemove={() => remove(rule.id)}
                onMove={(delta) => move(idx, delta)}
              />
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setEditing(blankRule())}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              {t("settings.transform.add")}
            </span>
          </Button>
        </div>

        {rules.length > 1 && (
          <p className="text-xs text-muted">
            {t("settings.transform.orderHint")}
          </p>
        )}
      </Section>

      {editing && (
        <TransformRuleModal
          rule={editing}
          onSave={upsert}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// One rule in the list. The pattern is the rule's name — it's what the user
// recognises it by — with the replacement shown beneath it, both in the same
// monospace face they were typed in.
function RuleRow({
  t,
  rule,
  first,
  last,
  onToggle,
  onEdit,
  onRemove,
  onMove,
}: {
  t: TFunction;
  rule: TransformRule;
  first: boolean;
  last: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const broken = compilePattern(rule.pattern, rule.caseInsensitive) === null;
  const kindLabel =
    rule.kind === "link"
      ? t("settings.transform.kindLink")
      : rule.kind === "text"
        ? t("settings.transform.kindText")
        : t("settings.transform.kindSensitive");
  const detail =
    rule.kind === "sensitive"
      ? t(`settings.transform.mask${maskSuffix(rule.mask)}` as MessageKey)
      : rule.replacement;

  return (
    <li className="flex items-start gap-2 rounded border border-line bg-surface-2 p-2">
      <span className="mt-1">
        <Checkbox
          checked={rule.enabled}
          onChange={onToggle}
          ariaLabel={t("settings.transform.enableRule", {
            pattern: rule.pattern,
          })}
          size="sm"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <code
            className={`font-mono text-sm break-all ${
              rule.enabled ? "text-fg-bright" : "text-muted"
            }`}
          >
            {rule.pattern}
          </code>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] tracking-wide text-muted uppercase">
            {kindLabel}
          </span>
          {broken && (
            <span className="text-[0.65rem] tracking-wide text-danger uppercase">
              {t("settings.transform.invalidBadge")}
            </span>
          )}
        </span>
        {detail !== "" && (
          <span className="font-mono text-xs break-all text-muted">
            {detail}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center">
        <IconButton
          label={t("settings.transform.moveUp", { pattern: rule.pattern })}
          onClick={() => onMove(-1)}
          disabled={first}
        >
          <ChevronUpIcon className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={t("settings.transform.moveDown", { pattern: rule.pattern })}
          onClick={() => onMove(1)}
          disabled={last}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={t("settings.transform.editRule", { pattern: rule.pattern })}
          onClick={onEdit}
        >
          <PencilIcon className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={t("settings.transform.removeRule", { pattern: rule.pattern })}
          onClick={onRemove}
          danger
        >
          <TrashIcon className="h-4 w-4" />
        </IconButton>
      </span>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded text-muted disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "cursor-pointer hover:bg-danger/10 hover:text-danger"
          : "cursor-pointer hover:bg-surface-3 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// The `settings.transform.mask*` key suffix for a mask style.
function maskSuffix(mask: TransformRule["mask"]): string {
  if (mask === "edges") return "Edges";
  if (mask === "last4") return "Last4";
  if (mask === "full") return "Full";
  return "Fixed";
}
