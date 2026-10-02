import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isStage = process.env.APP_ENV === 'stage';
  const buildNumber = parseInt(process.env.BUILD_NUMBER || process.env.EXPO_PUBLIC_BUILD_NUMBER || '1', 10);
  const version = "1.0.0";

  return {
    ...config,
    name: isStage ? "Strava Scout (Stage)" : "Strava Scout",
    slug: "strava-scout",
    version: version,
    orientation: "portrait",
    icon: "./assets/images/logo.png",
    scheme: "app",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/images/logo.png"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#18181A",
        foregroundImage: "./assets/images/logo.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      predictiveBackGestureEnabled: false,
      package: isStage 
        ? "com.nmanjuonline.stravascout.stage" 
        : "com.nmanjuonline.stravascout",
      versionCode: buildNumber,
      googleServicesFile: "./google-services.json",
      permissions: ["VIBRATE", "RECEIVE_BOOT_COMPLETED"]
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-notifications",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#18181A",
          image: "./assets/images/logo.png",
          imageWidth: 120
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "f0f99432-1627-467b-acee-5df4302499ff"
      },
      buildNumber: buildNumber,
      version: version,
      appEnv: isStage ? "stage" : "production"
    },
    owner: "nmanjuonline"
  };
};
