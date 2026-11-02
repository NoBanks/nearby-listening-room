import { createComponent, Types } from '@iwsdk/core';

export const Sleeve = createComponent('Sleeve', {
  trackIndex: { type: Types.Int16, default: 0 },
});

// IWSDK denies rays on hand-grabbable objects, so each record also carries an
// invisible target that answers distance pinches and mouse clicks.
export const SleeveHit = createComponent('SleeveHit', {
  trackIndex: { type: Types.Int16, default: 0 },
});
