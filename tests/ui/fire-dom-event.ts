import { act } from "@testing-library/preact";

// `@testing-library/preact`'s `fireEvent` dispatches through a lowercased
// `on<name>` probe on the target element: when the property exists it hands
// off to `@testing-library/dom`, and when it doesn't it falls back to a bare
// `new Event(...)` built from the *capitalised* helper name with no bubbling.
// jsdom implements no `oncompositionend` / `ontransitionend` property, so both
// of those land on the fallback and dispatch an event typed `"CompositionEnd"`
// / `"TransitionEnd"` that no listener ever matches — the handler simply never
// runs and the assertion fails for a reason that has nothing to do with the
// component.
//
// This builds the event the DOM would actually deliver: correct lowercase
// type, bubbling, with the init fields (`propertyName`, `data`, …) attached as
// own properties. Wrapped in `act` so the state it sets is committed before
// the caller asserts, exactly like `fireEvent`.
export function fireDomEvent(
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(init)) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  act(() => {
    target.dispatchEvent(event);
  });
}
