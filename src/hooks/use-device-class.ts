'use client';

import { useState, useEffect } from 'react';

export type DeviceClass = 'desktop' | 'mobile' | 'unknown';
export type DesktopOS = 'windows' | 'macos' | 'linux' | 'unknown';

interface DeviceInfo {
  /** Whether the device is desktop-class or mobile/phone */
  deviceClass: DeviceClass;
  /** Best-guess desktop OS (only meaningful when deviceClass is 'desktop') */
  desktopOS: DesktopOS;
  /** Whether the app is running inside the Tauri desktop runtime */
  isTauriRuntime: boolean;
  /** Whether this looks like a Windows-capable desktop (not phone, not already in Tauri) */
  isWindowsDesktopWeb: boolean;
}

/**
 * Detects the user's device class and OS for device-aware UI decisions.
 *
 * Uses a combination of:
 * - `navigator.userAgent` for OS detection
 * - CSS media query `pointer: coarse` for mobile/desktop distinction
 * - `window.__TAURI_INTERNALS__` for desktop app runtime detection
 *
 * Returns stable values after first client-side render.
 */
export function useDeviceClass(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>({
    deviceClass: 'unknown',
    desktopOS: 'unknown',
    isTauriRuntime: false,
    isWindowsDesktopWeb: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTauri = '__TAURI_INTERNALS__' in window;

    // Mobile detection: coarse pointer (touch-primary) or mobile UA keywords
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const hasMobileUA = /android|iphone|ipad|ipod|mobile|phone/i.test(ua);
    const isMobile = hasCoarsePointer && hasMobileUA;

    const deviceClass: DeviceClass = isMobile ? 'mobile' : 'desktop';

    // OS detection from UA
    let desktopOS: DesktopOS = 'unknown';
    if (/win(dows|64|32|nt)/i.test(ua)) desktopOS = 'windows';
    else if (/mac\s?os|macintosh/i.test(ua)) desktopOS = 'macos';
    else if (/linux/i.test(ua) && !hasMobileUA) desktopOS = 'linux';

    setInfo({
      deviceClass,
      desktopOS,
      isTauriRuntime: isTauri,
      isWindowsDesktopWeb: deviceClass === 'desktop' && !isTauri && (desktopOS === 'windows' || desktopOS === 'unknown'),
    });
  }, []);

  return info;
}
