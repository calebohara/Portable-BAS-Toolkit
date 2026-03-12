/**
 * Telnet (TCP) transport — wraps Tauri telnet bridge functions into a
 * lifecycle-managed service with automatic event listener cleanup.
 */

import {
  nativeTelnetConnect,
  nativeTelnetSend,
  nativeTelnetDisconnect,
  onTelnetData,
  onTelnetClosed,
  onTelnetError,
} from '@/lib/tauri-bridge';
import type { TransportCallbacks } from '../types';

export class TelnetTransport {
  private cleanupFns: (() => void)[] = [];
  private _connected = false;

  get connected() {
    return this._connected;
  }

  async connect(
    sessionId: string,
    host: string,
    port: number,
    callbacks: TransportCallbacks,
  ): Promise<void> {
    await this.cleanup();

    const unData = await onTelnetData(sessionId, callbacks.onData);
    const unClosed = await onTelnetClosed(sessionId, () => {
      this._connected = false;
      callbacks.onClosed();
    });
    const unError = await onTelnetError(sessionId, (error) => {
      this._connected = false;
      callbacks.onError(error);
    });
    this.cleanupFns = [unData, unClosed, unError];

    await nativeTelnetConnect(sessionId, host, port);
    this._connected = true;
  }

  async send(
    sessionId: string,
    data: string,
    lineEnding?: 'crlf' | 'cr' | 'lf',
  ): Promise<void> {
    await nativeTelnetSend(sessionId, data, lineEnding);
  }

  async disconnect(sessionId: string): Promise<void> {
    try {
      await nativeTelnetDisconnect(sessionId);
    } catch {
      /* ignore — connection may already be closed */
    }
    this._connected = false;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}
