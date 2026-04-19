import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { wifiService } from '../services/WifiService';
import { useDeviceStore } from '../store/useDeviceStore';
import { ControlCard } from '../components/ControlCard';
import { LogView } from '../components/LogView';

export function WifiScreen(): React.JSX.Element {
  const {
    wifiStatus,
    ipAddress,
    ledOn,
    relays,
    logs,
    setWifiStatus,
    setIpAddress,
    setLed,
    setRelay,
    addLog,
  } = useDeviceStore();

  const [ipInput, setIpInput] = useState<string>(ipAddress);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleConnect = useCallback(async () => {
    const trimmedIp = ipInput.trim();
    if (!trimmedIp) {
      Alert.alert('Input Error', 'Please enter a valid IP address.');
      return;
    }

    setWifiStatus('connecting');
    addLog(`Connecting to ESP32 at ${trimmedIp}...`);

    wifiService.setIpAddress(trimmedIp);
    setIpAddress(trimmedIp);

    const reachable = await wifiService.testConnection();

    if (reachable) {
      setWifiStatus('connected');
      addLog(`Connected to ESP32 at ${trimmedIp}.`);

      // Immediately sync device state
      try {
        const status = await wifiService.getStatus();
        setLed(status.led);
        status.relays.forEach((val, idx) => setRelay(idx, val));
        addLog('Initial status synced from device.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Status sync failed.';
        addLog(`WARN: ${msg}`);
      }
    } else {
      setWifiStatus('error');
      addLog(`ERROR: Could not reach ESP32 at ${trimmedIp}. Check IP and network.`);
      Alert.alert(
        'Connection Failed',
        `Could not reach the ESP32 at ${trimmedIp}.\n\nMake sure:\n• The ESP32 is powered on\n• Your phone and ESP32 are on the same WiFi network\n• The IP address is correct`
      );
    }
  }, [ipInput, setWifiStatus, setIpAddress, setLed, setRelay, addLog]);

  const handleDisconnect = useCallback(() => {
    setWifiStatus('disconnected');
    addLog('Disconnected (WiFi connection cleared).');
  }, [setWifiStatus, addLog]);

  const handleRefreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    addLog('Refreshing device status...');
    try {
      const status = await wifiService.getStatus();
      setLed(status.led);
      status.relays.forEach((val, idx) => setRelay(idx, val));
      addLog(
        `Status: LED=${status.led ? 'ON' : 'OFF'}, ` +
          `Relays=[${status.relays.map((r) => (r ? 'ON' : 'OFF')).join(', ')}]`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refresh failed.';
      addLog(`ERROR: ${msg}`);
      Alert.alert('Refresh Error', msg);
    } finally {
      setIsRefreshing(false);
    }
  }, [setLed, setRelay, addLog]);

  const handleLedToggle = useCallback(
    async (value: boolean) => {
      addLog(`Setting LED ${value ? 'ON' : 'OFF'}...`);
      try {
        await wifiService.setLed(value);
        setLed(value);
        addLog(`LED turned ${value ? 'ON' : 'OFF'}.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'LED command failed.';
        addLog(`ERROR: ${msg}`);
        Alert.alert('Command Error', msg);
      }
    },
    [setLed, addLog]
  );

  const handleRelayToggle = useCallback(
    async (index: number, value: boolean) => {
      const ch = index + 1;
      addLog(`Setting Relay ${ch} ${value ? 'ON' : 'OFF'}...`);
      try {
        await wifiService.setRelay(index, value);
        setRelay(index, value);
        addLog(`Relay ${ch} turned ${value ? 'ON' : 'OFF'}.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Relay command failed.';
        addLog(`ERROR: ${msg}`);
        Alert.alert('Command Error', msg);
      }
    },
    [setRelay, addLog]
  );

  const isConnected = wifiStatus === 'connected';
  const isConnecting = wifiStatus === 'connecting';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* IP Address input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ESP32 IP Address</Text>
          <TextInput
            mode="outlined"
            label="IP Address"
            placeholder="192.168.1.100"
            value={ipInput}
            onChangeText={setIpInput}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isConnected && !isConnecting}
            style={styles.input}
            outlineColor="#424242"
            activeOutlineColor="#1976D2"
            textColor="#e0e0e0"
            theme={{ colors: { background: '#1e1e1e' } }}
            right={
              isConnecting ? (
                <TextInput.Icon
                  icon={() => <ActivityIndicator size={16} color="#1976D2" />}
                />
              ) : undefined
            }
          />

          <View style={styles.connectRow}>
            {!isConnected ? (
              <Button
                mode="contained"
                onPress={handleConnect}
                disabled={isConnecting}
                loading={isConnecting}
                style={styles.connectButton}
                contentStyle={styles.buttonContent}
                buttonColor="#1976D2"
              >
                {isConnecting ? 'Connecting…' : 'Connect'}
              </Button>
            ) : (
              <Button
                mode="outlined"
                onPress={handleDisconnect}
                textColor="#ef5350"
                style={[styles.connectButton, styles.disconnectButton]}
                contentStyle={styles.buttonContent}
              >
                Disconnect
              </Button>
            )}
          </View>
        </View>

        {/* Status row */}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>WiFi Status: </Text>
          <View style={[styles.statusBadge, statusColor(wifiStatus)]}>
            <Text style={styles.statusBadgeText}>{wifiStatus.toUpperCase()}</Text>
          </View>
          {isConnected && (
            <Text style={styles.statusIp} numberOfLines={1}>
              {ipAddress}
            </Text>
          )}
        </View>

        {/* Controls — only shown when connected */}
        {isConnected && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Controls</Text>
                <Button
                  mode="text"
                  onPress={handleRefreshStatus}
                  loading={isRefreshing}
                  disabled={isRefreshing}
                  textColor="#1976D2"
                  compact
                >
                  Refresh Status
                </Button>
              </View>

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
          </>
        )}

        {wifiStatus === 'disconnected' && (
          <Text style={styles.hint}>
            Enter your ESP32's IP address and tap Connect.{'\n'}
            WiFi control works in both Expo Go and dev builds.
          </Text>
        )}

        {/* Log view */}
        <LogView logs={logs} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function statusColor(status: string): { backgroundColor: string } {
  switch (status) {
    case 'connected':
      return { backgroundColor: '#2e7d32' };
    case 'connecting':
      return { backgroundColor: '#e65100' };
    case 'error':
      return { backgroundColor: '#b71c1c' };
    default:
      return { backgroundColor: '#424242' };
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#1e1e1e',
    fontSize: 16,
  },
  connectRow: {
    flexDirection: 'row',
  },
  connectButton: {
    flex: 1,
    borderRadius: 10,
  },
  disconnectButton: {
    borderColor: '#ef5350',
  },
  buttonContent: {
    paddingVertical: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
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
  statusIp: {
    fontSize: 12,
    color: '#757575',
    flex: 1,
  },
  hint: {
    fontSize: 13,
    color: '#616161',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 20,
  },
});
