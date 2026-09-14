'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker so the worksheet can be added to a home screen
 * and opened full screen. If registration fails the worksheet still works in
 * full; installing is the only thing lost, so the failure stays quiet.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Nothing to tell the person here: everything on the page still works.
    });
  }, []);

  return null;
}
