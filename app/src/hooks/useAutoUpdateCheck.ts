import { useEffect, useRef } from 'react';
import { Alert, Linking, AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';

export function useAutoUpdateCheck() {
  const hasPrompted = useRef(false);

  const checkForUpdate = async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://strava-scout.nmanjuonline.workers.dev';
      const res = await fetch(`${apiUrl}/api/version`);
      if (!res.ok) return;

      const data = await res.json() as {
        latestVersion?: string;
        versionCode?: number;
        downloadUrl?: string;
        releaseNotes?: string;
      };

      const currentBuild = parseInt(
        Constants.expoConfig?.android?.versionCode?.toString() ??
        Constants.expoConfig?.extra?.buildNumber?.toString() ??
        process.env.EXPO_PUBLIC_BUILD_NUMBER ??
        '1',
        10
      );

      // If server has a strictly newer build and we haven't prompted in this session
      if (data.versionCode && data.versionCode > currentBuild && !hasPrompted.current) {
        hasPrompted.current = true;
        const downloadUrl = data.downloadUrl || `${apiUrl}/api/track/android`;
        
        Alert.alert(
          `🚀 Update Available (v${data.latestVersion || 'New'})`,
          `A new version is available with new features and improvements.\n\n${data.releaseNotes || 'Tap Update Now to download the latest APK.'}`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Update Now',
              style: 'default',
              onPress: () => {
                Linking.openURL(downloadUrl).catch(err => {
                  console.error('Failed to open download URL:', err);
                  Alert.alert('Error', 'Unable to open download link.');
                });
              },
            },
          ]
        );
      }
    } catch (e) {
      // Silently ignore background check errors so user experience is not disrupted
    }
  };

  useEffect(() => {
    // Check on startup
    checkForUpdate();

    // Also check when app comes back to foreground
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkForUpdate();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
