# ESP32 React Native Controller — Setup Guide

## Prerequisites

- Node.js 18 or later
- npm 9+ (comes with Node 18)
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli` (for cloud builds)
- Android Studio (for `expo run:android`) or Xcode (for `expo run:ios`)
- A physical Android or iOS device with USB debugging enabled

---

## 1. Install dependencies

```bash
cd esp32-rn-controller
npm install
```

---

## 2. WiFi-only mode (Expo Go — no BLE)

WiFi (HTTP fetch) works in the standard Expo Go app.

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone.

Open the **WiFi** tab, enter your ESP32's IP address, and tap **Connect**.

> BLE will not function in Expo Go — the BLE tab displays a clear warning banner.

---

## 3. Full BLE + WiFi (custom dev build)

BLE requires native modules that are not included in Expo Go.
You need a **custom development build** with `expo-dev-client`.

### Option A — Local build (USB, requires Android Studio)

```bash
npx expo run:android
```

This compiles and installs the app directly on your connected Android device.

### Option B — EAS cloud build (no Android Studio needed)

```bash
eas build --platform android --profile preview
```

This produces a downloadable `.apk`.
Install it on your device, then start the development server:

```bash
npx expo start --dev-client
```

Scan the QR code inside the installed dev build app.

---

## 4. Required Android permissions

The following permissions are declared in `app.json` and are granted automatically
on modern Android (12+) via the system Bluetooth permission dialog:

- `BLUETOOTH_SCAN` — scan for nearby BLE devices
- `BLUETOOTH_CONNECT` — connect to a BLE device
- `ACCESS_FINE_LOCATION` — required by Android for BLE scanning
- `INTERNET` — WiFi HTTP requests

---

## 5. ESP32 firmware

The companion Arduino sketch is located at:

```
../android-esp32-controller/esp32-firmware/esp32_controller.ino
```

Flash it to your ESP32 using the Arduino IDE or `esptool`.

The firmware exposes:

| Interface | Details |
|-----------|---------|
| BLE device name | `ESP32_Controller` |
| BLE service (Nordic UART) | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| BLE RX characteristic (write) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| BLE TX characteristic (notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |
| WiFi HTTP endpoint | `http://<ESP32_IP>/status`, `/led`, `/relay` |

### BLE commands sent by the app

| Command | Effect |
|---------|--------|
| `LED:ON` | Turn onboard LED on |
| `LED:OFF` | Turn onboard LED off |
| `RELAY1:ON` | Turn relay 1 on |
| `RELAY1:OFF` | Turn relay 1 off |
| `RELAY2:ON` … `RELAY4:OFF` | Same for relays 2–4 |

### WiFi HTTP endpoints

| Path | Description |
|------|-------------|
| `GET /status` | Returns `{"led":0,"relay":[0,0,0,0]}` |
| `GET /led?value=on` | Turns LED on |
| `GET /led?value=off` | Turns LED off |
| `GET /relay?ch=1&value=on` | Turns relay 1 on (ch = 1–4) |
| `GET /relay?ch=1&value=off` | Turns relay 1 off |

---

## 6. Finding the ESP32 IP address

After the ESP32 connects to your WiFi network, its IP address is printed to
the Arduino **Serial Monitor** at 115200 baud.

Alternatively, look up the DHCP client list in your router's admin panel
and find the device named `ESP32` or `espressif`.

---

## 7. EAS project setup (first time)

If `eas build` asks you to link a project, run:

```bash
eas init
```

and follow the prompts. This creates an `extra.eas.projectId` entry in `app.json`.
