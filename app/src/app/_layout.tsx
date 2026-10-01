import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAutoUpdateCheck } from '@/hooks/useAutoUpdateCheck';
import { PreferencesProviderWrapper, usePreferences } from '@/hooks/usePreferences';

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { activeTheme } = usePreferences();
  const { expoPushToken, notification } = usePushNotifications();
  useAutoUpdateCheck();
  const appState = useRef(AppState.currentState);

  const registerToken = useCallback((token: string) => {
    if (!token) return;
    console.log("Auto-registering Expo Push Token with server:", token);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://strava-scout.nmanjuonline.workers.dev';
    fetch(`${apiUrl}/api/register-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    }).then(res => {
        if (res.ok) console.log("Push token registered with server successfully");
        else console.error("Failed to register push token:", res.status);
    }).catch(err => console.error("Token registration error:", err));
  }, []);

  // Register on initial token acquisition
  useEffect(() => {
    if (expoPushToken) {
      registerToken(expoPushToken);
    }
  }, [expoPushToken, registerToken]);

  // Re-register on app resume / foregrounding to ensure token is never lost
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (expoPushToken) {
          registerToken(expoPushToken);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [expoPushToken, registerToken]);

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Slot />
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <PreferencesProviderWrapper>
      <RootLayoutInner />
    </PreferencesProviderWrapper>
  );
}
