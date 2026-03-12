/**
 * Serial transport — wraps Tauri serial bridge functions into a
 * lifecycle-managed service with automatic event listener cleanup.
 */

import {
  isTauri,
  nativeSerialListPorts,
  nativeSerialConnect,
  nativeSerialSend,
  nativeSerialDisconnect,
  onSerialData,
  onSerialClosed,
  onSerialError,
  type NativeSerialPortInfo,
} from '@/lib/tauri-bridge';
import type { TransportCallbacks } from '../types';

export class SerialTransport {
  private cleanupFns: (() => void)[] = [];
  private _connected = false;

  get connected() {
    return this._connected;
  }

  async listPorts(): Promise<NativeSerialPortInfo[]> {
    if (!isTauri()) return [];
    try {
      return await nativeSerialListPorts();
    } catch {
      return [];
    }
  }

  async connect(
    sessionId: string,
    portName: string,
    baudRate: number,
    callbacks: TransportCallbacks,
    opts?: { dataBits?: number; parity?: string; stopBits?: string },
  ): Promise<void> {
    await this.cleanup();

    const unData = await onSerialData(sessionId, callbacks.onData);
    const unClosed = await onSerialClosed(sessionId, () => {
      this._connected = false;
      callbacks.onClosed();
    });
    const unError = await onSerialError(sessionId, (error) => {
      this._connected = false;
      callbacks.onError(error);
    });
    this.cleanupFns = [unData, unClosed, unError];

    await nativeSerialConnect(
      sessionId,
      portName,
      baudRate,
      opts?.dataBits,
      opts?.parity,
      opts?.stopBits,
    );
    this._connected = true;
  }

  async send(
    sessionId: string,
    data: string,
    lineEnding?: 'crlf' | 'cr' | 'lf',
  ): Promise<void> {
    await nativeSerialSend(sessionId, data, lineEnding);
  }

  async disconnect(sessionId: string): Promise<void> {
    try {
      await nativeSerialDisconnect(sessionId);
    } catch {
      /* ignore — port may already be closed */
    }
    this._connected = false;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}
