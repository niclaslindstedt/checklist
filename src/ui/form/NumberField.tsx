// A digits-only text field: numeric keypad on mobile, contents selected on
// focus so a tap-and-type replaces the value outright, non-digits dropped as
// they're typed.
//
// The value is held by the caller as free-form **text** rather than a number,
// because a controlled `<input type="number">` fights every mid-edit state —
// it coerces an emptied field to 0 and then wedges on a leading zero, so
// clearing "12" to type "3" is impossible. The caller normalises the text to a
// valid number on blur (and again on save); until then whatever was typed
// stands.

type Props = {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  ariaLabel: string;
  /** Width utility — the fields sit in a row, so each caller picks its own. */
  className?: string;
};

export function NumberField({
  value,
  onChange,
  onBlur,
  ariaLabel,
  className = "w-16",
}: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      aria-label={ariaLabel}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.currentTarget.value.replace(/[^0-9]/g, ""))}
      onBlur={onBlur}
      className={`${className} rounded border border-line bg-surface-2 px-2 py-1.5 text-center text-sm text-fg-bright focus:border-accent focus:outline-none`}
    />
  );
}
