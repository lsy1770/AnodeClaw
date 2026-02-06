/**
 * Type declarations for ws (WebSocket)
 */

declare module 'ws' {
  import { EventEmitter } from 'events';

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    static readonly CONNECTING: number;
    static readonly CLOSING: number;

    readonly readyState: number;

    constructor(url: string, options?: Record<string, any>);

    send(data: string | Buffer, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;

    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export { WebSocket };
  export default WebSocket;
}
