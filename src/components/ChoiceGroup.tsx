import type { KeyboardEvent, ReactNode } from 'react';

interface ChoiceGroupProps {
  label: string;
  className: string;
  children: ReactNode;
}

/**
 * Delivers the keyboard behavior the `radio` role promises: the group is a
 * single tab stop and the arrow keys move between options. Without this, screen
 * readers announce a radio group whose arrow keys do nothing.
 */
export function ChoiceGroup({ label, className, children }: ChoiceGroupProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;

    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    if (options.length === 0) return;

    const focused = options.findIndex((option) => option === document.activeElement);
    const checked = options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
    const current = focused === -1 ? Math.max(checked, 0) : focused;
    const next = options[(current + (forward ? 1 : -1) + options.length) % options.length];
    if (!next) return;

    event.preventDefault();
    next.focus();
    next.click();
  }

  return (
    <div className={className} role="radiogroup" aria-label={label} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}
