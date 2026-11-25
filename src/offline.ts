// Offline play (vite-plugin-pwa): after the first visit the whole game is kept on the device, so it starts with no
// internet. A new version is downloaded in the background and applied when the player taps "Update" on the home
// screen (never in the middle of a run). Inside the claude.ai artifact or a browser without service workers this
// quietly does nothing.
import { registerSW } from 'virtual:pwa-register';

let apply: ((reload?: boolean) => Promise<void>) | null = null;

export function startOffline(): void {
  // Ask the browser to keep saves and drawings even when the device runs low on space.
  void navigator.storage?.persist?.().catch(() => false);
  if (!('serviceWorker' in navigator)) return;
  try {
    apply = registerSW({
      onNeedRefresh: () => window.dispatchEvent(new CustomEvent('ce:update-ready')),
      onOfflineReady: () => window.dispatchEvent(new CustomEvent('ce:offline-ready')),
      onRegisterError: () => undefined,
    });
  } catch {
    apply = null;
  }
}

/** Install the waiting version and reload the page. */
export function applyUpdate(): void {
  if (apply) void apply(true);
  else window.location.reload();
}
