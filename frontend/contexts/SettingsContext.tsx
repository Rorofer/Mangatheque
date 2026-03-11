import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

const WALLPAPER_STORAGE_KEY = 'anime_tracker_wallpaper';

// Simple in-memory storage fallback for web
let webStorage: { [key: string]: string } = {};

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      // Use localStorage on web
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return webStorage[key] || null;
    }
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn('Storage getItem error:', error);
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      } else {
        webStorage[key] = value;
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.warn('Storage setItem error:', error);
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      } else {
        delete webStorage[key];
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.warn('Storage removeItem error:', error);
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [wallpaper, setWallpaperState] = useState<WallpaperSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await getItem(WALLPAPER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWallpaperState(parsed);
      }
    } catch (error) {
      console.warn('Failed to load wallpaper settings:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setWallpaper = async (settings: WallpaperSettings) => {
    try {
      await setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(settings));
      setWallpaperState(settings);
    } catch (error) {
      console.warn('Failed to save wallpaper settings:', error);
      // Still update state even if storage fails
      setWallpaperState(settings);
    }
  };

  const clearWallpaper = async () => {
    try {
      await removeItem(WALLPAPER_STORAGE_KEY);
      setWallpaperState(defaultSettings);
    } catch (error) {
      console.warn('Failed to clear wallpaper settings:', error);
      setWallpaperState(defaultSettings);
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
