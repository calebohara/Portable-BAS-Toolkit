/**
 * Shared types for the HMI terminal system.
 */

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
export type ConnectionType = 'serial' | 'tcp';
export type FlowControl = 'none' | 'hardware' | 'software';

export interface SessionInfo {
  sessionId: string;
  connectionType: ConnectionType;
  connectedAt: string;
  label: string;
  // Serial
  serialPort?: string;
  baudRate?: number;
  dataBits?: number;
  parity?: string;
  stopBits?: string;
  flowControl?: FlowControl;
  // TCP
  host?: string;
  port?: number;
}

export interface TransportCallbacks {
  onData: (data: string) => void;
  onClosed: () => void;
  onError: (error: string) => void;
}
