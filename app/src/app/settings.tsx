import { useState } from 'react';
import { StyleSheet, View, Switch, TouchableOpacity, Alert, Linking, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { usePreferences } from '@/hooks/usePreferences';

export default function SettingsScreen() {
  const router = useRouter();
  const { themePreference, setThemePreference, activeOnly, setActiveOnly } = usePreferences();
  const [isChecking, setIsChecking] = useState(false);

  const version = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.android?.versionCode ?? 
                      Constants.expoConfig?.extra?.buildNumber ?? 
                      process.env.EXPO_PUBLIC_BUILD_NUMBER ?? 
                      '1';
  const appEnv = Constants.expoConfig?.extra?.appEnv || 
                 (process.env.APP_ENV === 'stage' ? 'stage' : 'production');
  const isStage = appEnv === 'stage';

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://strava-scout.nmanjuonline.workers.dev';
      const res = await fetch(`${apiUrl}/api/version`);
      if (res.ok) {
        const data = await res.json() as { version?: string; downloadUrl?: string };
        const downloadUrl = data.downloadUrl || `${apiUrl}/api/track/android`;
        
        Alert.alert(
          'Update Check',
          `Current: v${version} (Build ${buildNumber})\nEnvironment: ${isStage ? 'Stage' : 'Production'}\n\nWould you like to check for and download the latest build?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Download Latest APK', 
              onPress: () => {
                Linking.openURL(downloadUrl).catch(err => {
                  console.error('Failed to open download URL:', err);
                  Alert.alert('Error', 'Unable to open download link.');
                });
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Update Check',
          `Current Version: v${version} (Build ${buildNumber})\n\nUnable to retrieve server update info at this time.`
        );
      }
    } catch (e) {
      Alert.alert(
        'Update Check',
        `Current Version: v${version} (Build ${buildNumber})\n\nNetwork error checking for updates.`
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ThemedText style={styles.backText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>Settings</ThemedText>
        </View>

        <ScrollView 
          style={styles.scroll} 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Feed Preferences</ThemedText>
            
            <View style={styles.row}>
              <ThemedText>Show Active Challenges Only</ThemedText>
              <Switch
                value={activeOnly}
                onValueChange={setActiveOnly}
                trackColor={{ true: '#fc5200', false: 'rgba(150, 150, 150, 0.5)' }}
                thumbColor={'#ffffff'}
              />
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Theme</ThemedText>
            
            <TouchableOpacity 
              style={styles.row} 
              onPress={() => setThemePreference('system')}
            >
              <ThemedText>System Default</ThemedText>
              {themePreference === 'system' && <ThemedText style={styles.check}>✓</ThemedText>}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.row} 
              onPress={() => setThemePreference('light')}
            >
              <ThemedText>Light Mode</ThemedText>
              {themePreference === 'light' && <ThemedText style={styles.check}>✓</ThemedText>}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.row} 
              onPress={() => setThemePreference('dark')}
            >
              <ThemedText>Dark Mode</ThemedText>
              {themePreference === 'dark' && <ThemedText style={styles.check}>✓</ThemedText>}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>About & Updates</ThemedText>

            <View style={styles.row}>
              <ThemedText>Version</ThemedText>
              <ThemedText style={styles.valueText}>v{version} (Build {buildNumber})</ThemedText>
            </View>

            {isStage && (
              <View style={styles.row}>
                <ThemedText>Environment</ThemedText>
                <View style={[styles.badge, styles.badgeStage]}>
                  <ThemedText style={[styles.badgeText, styles.badgeTextStage]}>
                    Stage
                  </ThemedText>
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={styles.updateButton} 
              onPress={handleCheckForUpdates}
              disabled={isChecking}
            >
              {isChecking ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <ThemedText style={styles.updateButtonText}>Check for Updates</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  backButton: {
    marginRight: Spacing.four,
  },
  backText: {
    color: '#fc5200',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
    color: '#fc5200',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  check: {
    color: '#fc5200',
    fontWeight: 'bold',
  },
  valueText: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeStage: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeTextStage: {
    color: '#f59e0b',
  },
  updateButton: {
    backgroundColor: '#fc5200',
    marginTop: Spacing.four,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
