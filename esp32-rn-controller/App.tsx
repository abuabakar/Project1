import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { Text } from 'react-native';

import { BleScreen } from './src/screens/BleScreen';
import { WifiScreen } from './src/screens/WifiScreen';

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

type TabParamList = {
  BLE: undefined;
  WiFi: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// ---------------------------------------------------------------------------
// Custom dark theme for React Navigation (matches react-native-paper dark)
// ---------------------------------------------------------------------------

const NavDarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1976D2',
    background: '#121212',
    card: '#1a1a1a',
    text: '#e0e0e0',
    border: '#2a2a2a',
    notification: '#1976D2',
  },
};

// ---------------------------------------------------------------------------
// Custom Paper dark theme
// ---------------------------------------------------------------------------

const paperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#1976D2',
    background: '#121212',
    surface: '#1e1e1e',
    onSurface: '#e0e0e0',
    surfaceVariant: '#2a2a2a',
  },
};

// ---------------------------------------------------------------------------
// Simple tab icons using Unicode / text — avoids react-native-vector-icons
// native linking issues in managed Expo workflows
// ---------------------------------------------------------------------------

// Bluetooth symbol (U+1F4F6 = antenna with bars, closest widely-supported glyph)
function BleTabIcon({ focused }: { focused: boolean }): React.JSX.Element {
  return (
    <Text style={{ fontSize: 20, color: focused ? '#1976D2' : '#757575' }}>
      {'\u{1F4F6}'}
    </Text>
  );
}

// WiFi / network symbol (U+1F4F6 is the same but we add a label difference;
// use a router/globe glyph to visually distinguish the two tabs)
function WifiTabIcon({ focused }: { focused: boolean }): React.JSX.Element {
  return (
    <Text style={{ fontSize: 20, color: focused ? '#1976D2' : '#757575' }}>
      {'\u{1F310}'}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <NavigationContainer theme={NavDarkTheme}>
          <StatusBar style="light" backgroundColor="#1a1a1a" />
          <Tab.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: '#1a1a1a',
                elevation: 0,
                shadowOpacity: 0,
              },
              headerTintColor: '#e0e0e0',
              headerTitleStyle: {
                fontWeight: '700',
                fontSize: 18,
              },
              tabBarStyle: {
                backgroundColor: '#1a1a1a',
                borderTopColor: '#2a2a2a',
                borderTopWidth: 1,
                height: 60,
                paddingBottom: 8,
                paddingTop: 6,
              },
              tabBarActiveTintColor: '#1976D2',
              tabBarInactiveTintColor: '#757575',
              tabBarLabelStyle: {
                fontSize: 12,
                fontWeight: '600',
              },
            }}
          >
            <Tab.Screen
              name="BLE"
              component={BleScreen}
              options={{
                title: 'BLE',
                headerTitle: 'Bluetooth (BLE)',
                tabBarLabel: 'BLE',
                tabBarIcon: ({ focused }) => <BleTabIcon focused={focused} />,
              }}
            />
            <Tab.Screen
              name="WiFi"
              component={WifiScreen}
              options={{
                title: 'WiFi',
                headerTitle: 'WiFi Control',
                tabBarLabel: 'WiFi',
                tabBarIcon: ({ focused }) => <WifiTabIcon focused={focused} />,
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
