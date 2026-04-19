import { create } from 'zustand';

interface DeviceState {
  // BLE
  bleStatus: 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';
  bleDevices: Array<{ id: string; name: string }>;
  connectedDeviceId: string | null;
  // WiFi
  wifiStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  ipAddress: string;
  // Device state
  ledOn: boolean;
  relays: [boolean, boolean, boolean, boolean];
  // Log
  logs: string[];
  // Actions
  setBleStatus: (s: DeviceState['bleStatus']) => void;
  addBleDevice: (device: { id: string; name: string }) => void;
  clearBleDevices: () => void;
  setConnectedDevice: (id: string | null) => void;
  setWifiStatus: (s: DeviceState['wifiStatus']) => void;
  setIpAddress: (ip: string) => void;
  setLed: (on: boolean) => void;
  setRelay: (index: number, on: boolean) => void;
  addLog: (msg: string) => void;
}

const MAX_LOG_ENTRIES = 20;

function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}]`;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  // Initial BLE state
  bleStatus: 'disconnected',
  bleDevices: [],
  connectedDeviceId: null,

  // Initial WiFi state
  wifiStatus: 'disconnected',
  ipAddress: '',

  // Initial device state
  ledOn: false,
  relays: [false, false, false, false],

  // Initial log
  logs: [],

  // BLE actions
  setBleStatus: (s) => set({ bleStatus: s }),

  addBleDevice: (device) =>
    set((state) => {
      const alreadyExists = state.bleDevices.some((d) => d.id === device.id);
      if (alreadyExists) return state;
      return { bleDevices: [...state.bleDevices, device] };
    }),

  clearBleDevices: () => set({ bleDevices: [] }),

  setConnectedDevice: (id) => set({ connectedDeviceId: id }),

  // WiFi actions
  setWifiStatus: (s) => set({ wifiStatus: s }),

  setIpAddress: (ip) => set({ ipAddress: ip }),

  // Device control actions
  setLed: (on) => set({ ledOn: on }),

  setRelay: (index, on) =>
    set((state) => {
      const updated: [boolean, boolean, boolean, boolean] = [...state.relays] as [
        boolean,
        boolean,
        boolean,
        boolean,
      ];
      updated[index] = on;
      return { relays: updated };
    }),

  // Log action — prepends timestamp, keeps last MAX_LOG_ENTRIES entries
  addLog: (msg) =>
    set((state) => {
      const entry = `${timestamp()} ${msg}`;
      const updated = [entry, ...state.logs].slice(0, MAX_LOG_ENTRIES);
      return { logs: updated };
    }),
}));
