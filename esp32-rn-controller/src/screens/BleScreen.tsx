import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';
import { bleService } from '../services/BleService';
import { useDeviceStore } from '../store/useDeviceStore';
import { ControlCard } from '../components/ControlCard';
import { LogView } from '../components/LogView';

export function BleScreen(): React.JSX.Element {
  const {
    bleStatus,
    bleDevices,
    connectedDeviceId,
    ledOn,
    relays,
    logs,
    setBleStatus,
    addBleDevice,
    clearBleDevices,
    setConnectedDevice,
    setLed,
    setRelay,
    addLog,
  } = useDeviceStore();

  const [isConnecting, setIsConnecting] = useState(false);

  const handleScan = useCallback(async () => {
    try {
      await bleService.initialize();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bluetooth initialization failed.';
      Alert.alert('Bluetooth Error', msg);
      setBleStatus('error');
      addLog(`ERROR: ${msg}`);
      return;
    }

    clearBleDevices();
    setBleStatus('scanning');
    addLog('Started BLE scan (10s)...');

    bleService.startScan((device) => {
      if (device.name) {
        addBleDevice({ id: device.id, name: device.name });
        addLog(`Found device: ${device.name} (${device.id})`);
      }
    });

    setTimeout(() => {
      // Only revert to 'disconnected' if we are still in the 'scanning' state
      // (i.e. the user hasn't already tapped Connect). Read live state via the
      // Zustand getter to avoid a stale closure.
      if (useDeviceStore.getState().bleStatus === 'scanning') {
        setBleStatus('disconnected');
      }
      addLog('Scan complete.');
    }, 10000);
  }, [clearBleDevices, setBleStatus, addBleDevice, addLog]);

  const handleConnect = useCallback(
    async (deviceId: string, deviceName: string) => {
      setIsConnecting(true);
      setBleStatus('connecting');
      addLog(`Connecting to ${deviceName}...`);

      try {
        const device = await bleService.connect(deviceId);
        setConnectedDevice(device.id);
        setBleStatus('connected');
        addLog(`Connected to ${deviceName}.`);

        bleService.subscribeToNotifications((data) => {
          addLog(`RX: ${data}`);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Connection failed.';
        Alert.alert('Connection Error', msg);
        setBleStatus('error');
        addLog(`ERROR: ${msg}`);
      } finally {
        setIsConnecting(false);
      }
    },
    [setBleStatus, setConnectedDevice, addLog]
  );

  const handleDisconnect = useCallback(async () => {
    addLog('Disconnecting...');
    try {
      await bleService.disconnect();
      setConnectedDevice(null);
      setBleStatus('disconnected');
      addLog('Disconnected from device.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disconnect failed.';
      addLog(`ERROR: ${msg}`);
    }
  }, [setConnectedDevice, setBleStatus, addLog]);

  const handleLedToggle = useCallback(
    async (value: boolean) => {
      const cmd = value ? 'LED:ON' : 'LED:OFF';
      addLog(`TX: ${cmd}`);
      try {
        await bleService.sendCommand(cmd);
        setLed(value);
        addLog(`LED turned ${value ? 'ON' : 'OFF'}.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Command failed.';
        addLog(`ERROR: ${msg}`);
      }
    },
    [setLed, addLog]
  );

  const handleRelayToggle = useCallback(
    async (index: number, value: boolean) => {
      const ch = index + 1;
      const cmd = `RELAY${ch}:${value ? 'ON' : 'OFF'}`;
      addLog(`TX: ${cmd}`);
      try {
        await bleService.sendCommand(cmd);
        setRelay(index, value);
        addLog(`Relay ${ch} turned ${value ? 'ON' : 'OFF'}.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Command failed.';
        addLog(`ERROR: ${msg}`);
      }
    },
    [setRelay, addLog]
  );

  const isConnected = bleStatus === 'connected';
  const isScanning = bleStatus === 'scanning';

  const connectedDevice = bleDevices.find((d) => d.id === connectedDeviceId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* BLE + Expo Go Warning Banner */}
      <View style={styles.warningBanner}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningText}>
          BLE requires{' '}
          <Text style={styles.warningBold}>expo-dev-client</Text> (custom dev
          build) — it does NOT work in plain Expo Go.{'\n'}
          Build with:{' '}
          <Text style={styles.warningCode}>expo run:android</Text>
          {'\n'}or:{' '}
          <Text style={styles.warningCode}>
            eas build --platform android --profile preview
          </Text>
        </Text>
      </View>

      {/* Status row */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>BLE Status: </Text>
        <View style={[styles.statusBadge, statusColor(bleStatus)]}>
          <Text style={styles.statusBadgeText}>{bleStatus.toUpperCase()}</Text>
        </View>
      </View>

      {/* Scan button */}
      {!isConnected && (
        <Button
          mode="contained"
          onPress={handleScan}
          loading={isScanning}
          disabled={isScanning || isConnecting}
          style={styles.actionButton}
          contentStyle={styles.buttonContent}
          buttonColor="#1976D2"
        >
          {isScanning ? 'Scanning…' : 'Scan for Devices'}
        </Button>
      )}

      {/* Device list */}
      {bleDevices.length > 0 && !isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Found Devices</Text>
          <FlatList
            data={bleDevices}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.connectBtn,
                    isConnecting && styles.connectBtnDisabled,
                  ]}
                  onPress={() => handleConnect(item.id, item.name)}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <ActivityIndicator size={14} color="#fff" />
                  ) : (
                    <Text style={styles.connectBtnText}>Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {bleDevices.length === 0 && bleStatus === 'disconnected' && (
        <Text style={styles.hint}>
          Tap "Scan for Devices" to search for nearby ESP32 devices.
        </Text>
      )}

      {/* Connected device section */}
      {isConnected && connectedDevice && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Device</Text>
          <View style={styles.connectedCard}>
            <View>
              <Text style={styles.connectedName}>{connectedDevice.name}</Text>
              <Text style={styles.connectedId}>{connectedDevice.id}</Text>
            </View>
            <Button
              mode="outlined"
              onPress={handleDisconnect}
              textColor="#ef5350"
              style={styles.disconnectBtn}
            >
              Disconnect
            </Button>
          </View>
        </View>
      )}

      {/* Controls — only shown when connected */}
      {isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Controls</Text>
          <ControlCard
            title="Onboard LED"
            value={ledOn}
            onToggle={handleLedToggle}
            color="#FFD600"
          />
          {relays.map((relay, index) => (
            <ControlCard
              key={`relay-${index}`}
              title={`Relay ${index + 1}`}
              value={relay}
              onToggle={(val) => handleRelayToggle(index, val)}
              color="#1976D2"
            />
          ))}
        </View>
      )}

      {/* Log view */}
      <LogView logs={logs} />
    </ScrollView>
  );
}

function statusColor(status: string): { backgroundColor: string } {
  switch (status) {
    case 'connected':
      return { backgroundColor: '#2e7d32' };
    case 'scanning':
    case 'connecting':
      return { backgroundColor: '#e65100' };
    case 'error':
      return { backgroundColor: '#b71c1c' };
    default:
      return { backgroundColor: '#424242' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  warningBanner: {
    backgroundColor: '#2c1f00',
    borderLeftWidth: 4,
    borderLeftColor: '#FF8F00',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#FFD54F',
    lineHeight: 20,
  },
  warningBold: {
    fontWeight: '700',
    color: '#FFCA28',
  },
  warningCode: {
    fontFamily: 'monospace',
    backgroundColor: '#1a1200',
    color: '#FFF176',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 14,
    color: '#9e9e9e',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  actionButton: {
    marginBottom: 16,
    borderRadius: 10,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9e9e9e',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  deviceId: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  connectBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1b2a1b',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  connectedName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a5d6a7',
  },
  connectedId: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  disconnectBtn: {
    borderColor: '#ef5350',
    borderRadius: 8,
  },
  hint: {
    fontSize: 13,
    color: '#616161',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
});
