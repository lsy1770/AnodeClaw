/**
 * Type declarations for dingtalk-stream-sdk-nodejs
 */

declare module 'dingtalk-stream-sdk-nodejs' {
  export class Client {
    constructor(config: {
      clientId: string;
      clientSecret: string;
    });

    registerCallbackListener(event: string, callback: (data: any) => void): void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
  }
}
