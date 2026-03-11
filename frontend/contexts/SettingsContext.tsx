import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WallpaperSettings {
  imageUrl: string | null;
  opacity: number;
  blur: boolean;
}

interface SettingsContextType {
  wallpaper: WallpaperSettings;
  setWallpaper: (settings: WallpaperSettings) => Promise<void>;
  clearWallpaper: () => Promise<void>;
}

const defaultSettings: WallpaperSettings = {
  imageUrl: null,
  opacity: 0.3,
  blur: true,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const WALLPAPER_STORAGE_KEY = '@anime_tracker_wallpaper';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [wallpaper, setWallpaperState] = useState<WallpaperSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(WALLPAPER_STORAGE_KEY);
      if (stored) {
        setWallpaperState(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load wallpaper settings:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setWallpaper = async (settings: WallpaperSettings) => {
    try {
      await AsyncStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(settings));
      setWallpaperState(settings);
    } catch (error) {
      console.error('Failed to save wallpaper settings:', error);
    }
  };

  const clearWallpaper = async () => {
    try {
      await AsyncStorage.removeItem(WALLPAPER_STORAGE_KEY);
      setWallpaperState(defaultSettings);
    } catch (error) {
      console.error('Failed to clear wallpaper settings:', error);
    }
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <SettingsContext.Provider value={{ wallpaper, setWallpaper, clearWallpaper }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
