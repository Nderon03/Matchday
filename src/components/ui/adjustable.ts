import { Platform } from 'react-native';

/**
 * One accessible "adjustable" control (swipe pickers, steppers, score boxes): screen readers get its
 * name and current value and can step it up or down; on the web it also takes the arrow keys. The
 * +/- buttons drawn inside are for touch and mouse, so they're kept out of the screen-reader and
 * keyboard order (see `touchOnly`), otherwise they'd be nested controls inside a control.
 */
export function adjustable(o: { label: string; now: number; min: number; max: number; text?: string; step: (dir: 1 | -1) => void }) {
  const props: Record<string, unknown> = {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: o.label,
    accessibilityValue: { min: o.min, max: o.max, now: o.now, ...(o.text ? { text: o.text } : {}) },
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => o.step(e.nativeEvent.actionName === 'increment' ? 1 : -1),
    // the web needs the value as ARIA attributes
    'aria-valuenow': o.now, 'aria-valuemin': o.min, 'aria-valuemax': o.max, ...(o.text ? { 'aria-valuetext': o.text } : {}),
  };
  if (Platform.OS === 'web') {
    props.focusable = true;
    props.onKeyDown = (e: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
      const key = e.nativeEvent?.key ?? e.key;
      const dir = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
      if (dir) { e.preventDefault?.(); o.step(dir); }
    };
  }
  return props as object;
}

/** For the +/- buttons inside an adjustable control: tappable, but not separately focusable. */
export const touchOnly = {
  focusable: false, 'aria-hidden': true, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true,
} as const;
