import { afterEach } from 'vitest';

/**
 * Setup shared by the DOM tests. Guarded on `document` because Vitest applies
 * setup files to every test file, including the ones that run in the node
 * environment.
 */
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);

  installDialogShim();
}

/**
 * jsdom does not implement `<dialog>`: `showModal`, `show` and `close` are all
 * missing, so any component that opens a modal throws on render. This shim adds
 * just enough behaviour to exercise the open/close contract — it deliberately
 * does not emulate the top layer, focus trapping, or Escape handling, which are
 * browser responsibilities verified by the end-to-end tests instead.
 */
function installDialogShim(): void {
  const prototype = window.HTMLDialogElement?.prototype;
  if (!prototype || typeof prototype.showModal === 'function') return;

  const open = (dialog: HTMLDialogElement, modal: boolean): void => {
    dialog.setAttribute('open', '');
    if (modal) dialog.setAttribute('data-modal', 'true');
  };

  prototype.showModal = function showModal(this: HTMLDialogElement): void {
    open(this, true);
  };

  prototype.show = function show(this: HTMLDialogElement): void {
    open(this, false);
  };

  prototype.close = function close(this: HTMLDialogElement, returnValue?: string): void {
    this.removeAttribute('open');
    this.removeAttribute('data-modal');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new window.Event('close'));
  };
}
