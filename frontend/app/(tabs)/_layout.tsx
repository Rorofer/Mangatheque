import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SearchScreen from './index';
import LibraryScreen from './library';
import SettingsModal from './settings';
import { useSettings } from '../../contexts/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TabLayout() {
  const [currentPage, setCurrentPage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const { wallpaper } = useSettings();

  const tabs = [
    { key: 'search', title: 'Recherche', icon: 'search' },
    { key: 'library', title: 'Bibliothèque', icon: 'library' },
  ];

  const handleTabPress = (index: number) => {
    setCurrentPage(index);
  };

  const renderContent = () => (
    <View style={styles.contentContainer}>
      {/* Settings Button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowSettings(true)}
      >
        <Ionicons name="settings-outline" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Screen Content */}
      <View style={styles.screenContainer}>
        {currentPage === 0 ? <SearchScreen /> : <LibraryScreen />}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => handleTabPress(index)}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={currentPage === index ? '#e63946' : '#888'}
            />
            <Text style={[
              styles.tabLabel,
              currentPage === index && styles.tabLabelActive
            ]}>
              {tab.title}
            </Text>
            {currentPage === index && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Settings Modal */}
      <SettingsModal 
        visible={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {wallpaper.imageUrl ? (
        <ImageBackground
          source={{ uri: wallpaper.imageUrl }}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={[
            styles.overlay,
            { opacity: 1 - wallpaper.opacity }
          ]} />
          {renderContent()}
        </ImageBackground>
      ) : (
        renderContent()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f0f0f',
  },
  contentContainer: {
    flex: 1,
  },
  settingsButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 16,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderTopColor: '#2a2a2a',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 65,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#e63946',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e63946',
  },
});
