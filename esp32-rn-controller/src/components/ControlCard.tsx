import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Surface, Switch } from 'react-native-paper';

interface ControlCardProps {
  title: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  color?: string;
}

export function ControlCard({
  title,
  value,
  onToggle,
  disabled = false,
  color = '#1976D2',
}: ControlCardProps): React.JSX.Element {
  return (
    <Surface style={styles.card} elevation={3}>
      <View style={styles.row}>
        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* ON / OFF badge */}
        <View
          style={[
            styles.badge,
            { backgroundColor: value ? color : '#444' },
          ]}
        >
          <Text style={styles.badgeText}>{value ? 'ON' : 'OFF'}</Text>
        </View>

        {/* Toggle switch */}
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          color={color}
          style={styles.switch}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1e1e1e',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginRight: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  switch: {
    marginLeft: 0,
  },
});
