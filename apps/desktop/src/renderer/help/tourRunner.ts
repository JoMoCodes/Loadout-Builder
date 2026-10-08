// Runs one page tour with driver.js: a dimmed window with a hole over one control at a time and a
// tooltip with Back, Next, Skip and "Step 2 of 5". Keyboard: Enter or the right arrow goes on, the
// left arrow goes back, Esc skips. Clicking outside the tooltip does nothing, so a stray click
// does not end it, and the lit-up control cannot be pressed while the tour is on.

import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import type { Tour, TourStep } from './tours';

let active: { tour: Driver; end(): void } | null = null;

function onScreen(selector: string): boolean {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** The steps whose control is on screen now (steps with no control always stay). */
export function stepsOnScreen(steps: readonly TourStep[]): TourStep[] {
  return steps.filter((step) => !step.element || onScreen(step.element));
}

export function tourIsRunning(): boolean {
  return active !== null;
}

export function stopTour(): void {
  active?.end();
  active = null;
}

/**
 * Starts the tour. `onEnd` runs once when it ends, however it ends (Done, Skip, Esc). Returns
 * false, and runs nothing, if none of its steps can be shown.
 */
export function runTour(tour: Tour, onEnd: () => void): boolean {
  const steps = stepsOnScreen(tour.steps);
  if (steps.length === 0) return false;
  stopTour();

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ended = false;
  let tour$: Driver | null = null;

  // Every way out (Done, Skip, Esc, Enter on the last step) comes through here, once.
  const end = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener('keydown', onKey, true);
    if (tour$?.isActive()) tour$.destroy();
    if (active?.tour === tour$) active = null;
    onEnd();
  };

  // Enter goes on, wherever the focus is in the tooltip. Only when the person has moved the
  // focus themselves with Tab (onto Back or Skip) does Enter press that button instead.
  let tabbed = false;
  const onKey = (event: KeyboardEvent) => {
    if (!tour$) return;
    if (event.key === 'Tab') {
      tabbed = true;
      return;
    }
    if (event.key !== 'Enter') return;
    const focused = document.activeElement;
    if (tabbed && focused?.closest('.driver-popover-prev-btn, [data-tour-skip]')) return;
    event.preventDefault();
    event.stopPropagation();
    if (tour$.isLastStep()) end();
    else tour$.moveNext();
  };

  tour$ = driver({
    steps: steps.map((step) => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.text,
        side: step.side,
        align: 'start',
      },
    })),
    showProgress: true,
    progressText: 'Step {{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    showButtons: ['next', 'previous'],
    allowClose: true,
    allowKeyboardControl: true,
    overlayClickBehavior: () => {},
    disableActiveInteraction: true,
    animate: !reduceMotion,
    smoothScroll: !reduceMotion,
    stagePadding: 6,
    popoverClass: 'lb-tour',
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute('data-testid', 'tour');
      popover.wrapper.setAttribute('data-tour-name', tour.name);
      popover.wrapper.setAttribute('role', 'dialog');
      popover.wrapper.setAttribute('aria-label', `Tour: ${tour.label}`);
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.textContent = 'Skip';
      skip.title = 'Skip the tour (Esc)';
      skip.className = 'lb-tour-skip';
      skip.setAttribute('data-tour-skip', '');
      skip.addEventListener('click', end);
      popover.footer.insertBefore(skip, popover.footer.firstChild);
      tabbed = false;
      // Put the focus on Next, so Space goes on as well.
      setTimeout(() => popover.nextButton.focus(), 0);
    },
    // Moving on quickly can leave the ring on the control before; only the one shown keeps it.
    onHighlighted: (element) => {
      for (const old of document.querySelectorAll('.driver-active-element')) {
        if (old !== element) old.classList.remove('driver-active-element', 'driver-no-interaction');
      }
    },
    // driver.js asks before it closes (Done, Esc): close it here, so the ending is always seen.
    onDestroyStarted: () => end(),
  });

  window.addEventListener('keydown', onKey, true);
  active = { tour: tour$, end };
  tour$.drive();
  return true;
}
