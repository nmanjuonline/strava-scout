import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { PreferencesProviderWrapper, usePreferences } from '@/hooks/usePreferences';

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { activeTheme } = usePreferences();
  const { expoPushToken, notification } = usePushNotifications();
  
  useEffect(() => {
      if (expoPushToken) {
          console.log("Expo Push Token:", expoPushToken);
          // Auto-register the token with the server so push notifications reach this device
          fetch('https://strava-scout.nmanjuonline.workers.dev/api/register-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: expoPushToken }),
          }).then(res => {
              if (res.ok) console.log("Push token registered with server");
              else console.error("Failed to register push token:", res.status);
          }).catch(err => console.error("Token registration error:", err));
      }
  }, [expoPushToken]);

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
