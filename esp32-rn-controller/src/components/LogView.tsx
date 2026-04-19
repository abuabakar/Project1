import React, { useEffect, useRef } from 'react';
import { StyleSheet, ScrollView, Text, View } from 'react-native';

interface LogViewProps {
  logs: string[];
}

export function LogView({ logs }: LogViewProps): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom whenever logs update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [logs]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.heading}>Console Output</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
      >
        {logs.length === 0 ? (
          <Text style={styles.empty}>No log entries yet.</Text>
        ) : (
          // Logs are stored newest-first; display oldest-first for readability
          [...logs].reverse().map((entry, index) => (
            <Text key={index} style={styles.line}>
              {entry}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9e9e9e',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scrollView: {
    height: 150,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  content: {
    padding: 10,
    flexGrow: 1,
  },
  line: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#00e676',
    lineHeight: 18,
  },
  empty: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
  },
});
