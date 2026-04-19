import { BleManager, Device, Characteristic, State, Subscription } from 'react-native-ble-plx';
import { decode as atob, encode as btoa } from 'base-64';

// Nordic UART Service UUIDs
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHAR_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write to ESP32
const CHAR_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify from ESP32

const ESP32_DEVICE_NAME = 'ESP32_Controller';
const SCAN_TIMEOUT_MS = 10000;

class BleService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private notificationSubscription: Subscription | null = null;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * Checks the current BLE adapter state.
   * Throws an error if Bluetooth is powered off or unavailable.
   */
  async initialize(): Promise<void> {
    const state = await this.manager.state();
    if (state === State.PoweredOff) {
      throw new Error('Bluetooth is powered off. Please enable Bluetooth and try again.');
    }
    if (state === State.Unauthorized) {
      throw new Error('Bluetooth permission denied. Please grant Bluetooth permissions in Settings.');
    }
    if (state === State.Unsupported) {
      throw new Error('Bluetooth is not supported on this device.');
    }
    if (state !== State.PoweredOn) {
      throw new Error(`Bluetooth is not ready (state: ${state}). Please wait and try again.`);
    }
  }

  /**
   * Starts scanning for BLE devices whose name matches ESP32_Controller.
   * Automatically stops after SCAN_TIMEOUT_MS milliseconds.
   */
  startScan(onDevice: (device: Device) => void): void {
    const seenIds = new Set<string>();

    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error.message);
          return;
        }
        if (device && device.name === ESP32_DEVICE_NAME) {
          if (!seenIds.has(device.id)) {
            seenIds.add(device.id);
            onDevice(device);
          }
        }
      },
    );

    // Auto-stop after timeout
    this.scanTimeout = setTimeout(() => {
      this.stopScan();
    }, SCAN_TIMEOUT_MS);
  }

  /**
   * Stops an active BLE scan.
   */
  stopScan(): void {
    if (this.scanTimeout !== null) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.manager.stopDeviceScan();
  }

  /**
   * Connects to a device by ID, then discovers all services and characteristics.
   * Returns the connected Device object.
   */
  async connect(deviceId: string): Promise<Device> {
    this.stopScan();

    const device = await this.manager.connectToDevice(deviceId, {
      requestMTU: 512,
    });

    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;
    return device;
  }

  /**
   * Disconnects from the currently connected device and cleans up subscriptions.
   */
  async disconnect(): Promise<void> {
    if (this.notificationSubscription) {
      this.notificationSubscription.remove();
      this.notificationSubscription = null;
    }

    if (this.connectedDevice) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      } catch (err) {
        // Device may have already disconnected; ignore the error
        console.warn('[BLE] Disconnect warning:', err);
      }
      this.connectedDevice = null;
    }
  }

  /**
   * Sends a UTF-8 string command to the ESP32 by writing to the RX characteristic.
   * The value is base64-encoded as required by react-native-ble-plx.
   */
  async sendCommand(command: string): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected. Please connect to an ESP32 first.');
    }

    const encoded = btoa(command);

    await this.connectedDevice.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CHAR_RX_UUID,
      encoded,
    );
  }

  /**
   * Subscribes to notifications on the TX characteristic.
   * Decoded base64 payloads are passed to the onData callback as plain strings.
   */
  subscribeToNotifications(onData: (data: string) => void): void {
    if (!this.connectedDevice) {
      throw new Error('No device connected. Please connect to an ESP32 first.');
    }

    this.notificationSubscription = this.connectedDevice.monitorCharacteristicForService(
      SERVICE_UUID,
      CHAR_TX_UUID,
      (error: Error | null, characteristic: Characteristic | null) => {
        if (error) {
          console.error('[BLE] Notification error:', error.message);
          return;
        }
        if (characteristic?.value) {
          try {
            const decoded = atob(characteristic.value);
            onData(decoded);
          } catch (decodeError) {
            console.error('[BLE] Base64 decode error:', decodeError);
          }
        }
      },
    );
  }

  /**
   * Returns the current BLE adapter state.
   */
  async getState(): Promise<State> {
    return this.manager.state();
  }

  /**
   * Whether a device is currently connected.
   */
  get isConnected(): boolean {
    return this.connectedDevice !== null;
  }
}

// Export as singleton
export const bleService = new BleService();
