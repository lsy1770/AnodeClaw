/**
 * TypeScript type definitions for Anode APIs
 * These APIs are provided by the ACS platform via the acs-core module
 *
 * Import via: import { file, auto, device, ... } from 'acs-core';
 */

declare module 'acs-core' {
  /**
   * AutomatorAPI - Android 自动化 API
   */
  export const auto: {
    click(x: number, y: number): Promise<void>;
    swipe(startX: number, startY: number, endX: number, endY: number, duration: number): Promise<void>;
    findNode(selector: { text?: string; id?: string; className?: string }): Promise<any[]>;
    inputText(text: string): Promise<void>;
    back(): Promise<void>;
    home(): Promise<void>;
    recents(): Promise<void>;
    screenshot(path?: string): Promise<string>;
    getCurrentPackage(): Promise<string | null>;
    getCurrentActivity(): Promise<string | null>;
  };

  /**
   * FileAPI - 文件操作 API
   */
  export const file: {
    read(path: string, encoding?: string): Promise<string>;
    write(path: string, content: string, encoding?: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    delete(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string): Promise<string[]>;
    stat(path: string): Promise<{
      size: number;
      isFile: boolean;
      isDirectory: boolean;
      modified: number;
    }>;
  };

  /**
   * DeviceAPI - 设备信息 API
   */
  export const device: {
    getDeviceInfo(): Promise<{
      model: string;
      brand: string;
      version: string;
      sdk: number;
      width: number;
      height: number;
    }>;
    getBatteryInfo(): Promise<{
      level: number;
      isCharging: boolean;
    }>;
    vibrate(duration: number): Promise<void>;
  };

  /**
   * ImageAPI - 图像处理 API
   */
  export const image: {
    load(path: string): Promise<any>;
    save(image: any, path: string): Promise<void>;
    resize(image: any, width: number, height: number): Promise<any>;
  };

  /**
   * MediaAPI - 媒体操作 API
   */
  export const media: {
    playSound(path: string): Promise<void>;
    stopSound(): Promise<void>;
  };

  /**
   * UIAPI - UI 操作 API
   */
  export const ui: {
    showToast(message: string, duration?: number): Promise<void>;
    showDialog(title: string, message: string, buttons?: string[]): Promise<number>;
  };

  /**
   * FloatingWindowAPI - 悬浮窗 API
   */
  export const floatingWindow: {
    create(config: {
      xml: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }): Promise<string>;
    show(windowId: string): Promise<void>;
    hide(windowId: string): Promise<void>;
    close(windowId: string): Promise<void>;
    on(event: string, callback: (data: any) => void): Promise<void>;
    setPosition(windowId: string, x: number, y: number): Promise<void>;
  };

  /**
   * NetworkAPI - 网络请求 API
   */
  export const http: {
    request(config: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      data?: any;
      timeout?: number;
    }): Promise<{
      status: number;
      headers: Record<string, string>;
      data: any;
    }>;
    get(url: string, config?: any): Promise<any>;
    post(url: string, data?: any, config?: any): Promise<any>;
  };

  /**
   * LocalStorageAPI - 本地存储 API
   */
  export const storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
  };

  /**
   * NotificationAPI - 通知 API
   */
  export const notification: {
    show(config: {
      title: string;
      content: string;
      icon?: string;
    }): Promise<void>;
    cancel(id: number): Promise<void>;
  };

  /**
   * AppAPI - 应用管理 API
   */
  export const app: {
    launch(packageName: string): Promise<void>;
    kill(packageName: string): Promise<void>;
    getPackages(): Promise<string[]>;
  };

  /**
   * SensorsAPI - 传感器 API
   */
  export const sensors: {
    getAccelerometer(): Promise<{ x: number; y: number; z: number }>;
    getGyroscope(): Promise<{ x: number; y: number; z: number }>;
  };

  /**
   * GlobalAPI - 全局 API
   */
  export const globalApi: {
    exit(code?: number): void;
    sleep(ms: number): Promise<void>;
  };

  /**
   * PluginAPI - 插件 API
   */
  export const plugin: {
    load(path: string): Promise<any>;
    unload(name: string): Promise<void>;
  };

  /**
   * PreloadAPI - 预加载 API
   */
  export const preload: {
    loadScript(path: string): Promise<void>;
  };
}
