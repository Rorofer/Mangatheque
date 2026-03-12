import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, ImageBackground, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import SearchScreen from './index';
import LibraryScreen from './library';
import SettingsModal from './settings';
import { useSettings } from '../../contexts/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Wrap screens in functions for TabView
const SearchRoute = () => <SearchScreen />;
const LibraryRoute = () => <LibraryScreen />;

const renderScene = SceneMap({
  search: SearchRoute,
  library: LibraryRoute,
});

export default function TabLayout() {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const { wallpaper } = useSettings();

  const [routes] = useState([
    { key: 'search', title: 'Recherche', icon: 'search' },
    { key: 'library', title: 'Bibliothèque', icon: 'library' },
  ]);

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      style={styles.tabBar}
      indicatorStyle={styles.tabIndicator}
      activeColor="#e63946"
      inactiveColor="#888"
      pressColor="rgba(230, 57, 70, 0.1)"
      renderLabel={({ route, focused, color }) => (
        <View style={styles.tabLabelContainer}>
          <Ionicons
            name={route.icon as any}
            size={22}
            color={color}
          />
          <Text style={[styles.tabLabel, { color }]}>
            {route.title}
          </Text>
        </View>
      )}
    />
  );

  const renderContent = () => (
    <View style={styles.contentContainer}>
      {/* Settings Button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowSettings(true)}
      >
        <Ionicons name="settings-outline" size={24} color="#fff" />
      </TouchableOpacity>

      {/* TabView with Swipe */}
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={renderTabBar}
        tabBarPosition="bottom"
        swipeEnabled={true}
        style={styles.tabView}
      />

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
  tabView: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderTopColor: '#2a2a2a',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 65,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  tabIndicator: {
    backgroundColor: '#e63946',
    height: 3,
    borderRadius: 2,
  },
  tabLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
