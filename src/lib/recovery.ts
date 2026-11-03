/**
 * Tracks that the user arrived from a password-reset link, so nothing else (the link page,
 * the signed-in layout) can send them to the home screen before they choose a new password.
 */
let recovering = false;
export const startRecovery = () => { recovering = true; };
export const finishRecovery = () => { recovering = false; };
export const isRecovering = () => recovering;
