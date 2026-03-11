import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import axios from 'axios';
import { useSettings } from '../../contexts/SettingsContext';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface AnimeImage {
  mal_id: number;
  title: string;
  image_url: string;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { wallpaper, setWallpaper, clearWallpaper } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnimeImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(wallpaper.imageUrl);
  const [opacity, setOpacity] = useState(wallpaper.opacity);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSelectedImage(wallpaper.imageUrl);
    setOpacity(wallpaper.opacity);
  }, [wallpaper]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      searchTimeoutRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const response = await axios.get(
            `${API_BASE}/api/search/anime`,
            { params: { q: searchQuery, limit: 12 }, timeout: 15000 }
          );
          const results = response.data.data
            .filter((item: any) => item.image_url)
            .map((item: any) => ({
              mal_id: item.mal_id,
              title: item.title,
              image_url: item.image_url,
            }));
          setSearchResults(results);
        } catch (error) {
          console.error('Search error:', error);
          setSearchResults([]);
        } finally {
          setLoading(false);
        }
      }, 400);
    } else {
      setSearchResults([]);
    }
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  const handleApplyWallpaper = async () => {
    if (selectedImage) {
      await setWallpaper({
        imageUrl: selectedImage,
        opacity: opacity,
        blur: true,
      });
    }
    setShowImagePicker(false);
  };

  const handleRemoveWallpaper = async () => {
    await clearWallpaper();
    setSelectedImage(null);
    setOpacity(0.3);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Paramètres</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Wallpaper Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="image" size={22} color="#e63946" />
                <Text style={styles.sectionTitle}>Fond d'écran</Text>
              </View>
              
              <Text style={styles.sectionDescription}>
                Personnalisez l'arrière-plan avec votre anime préféré
              </Text>

              {/* Current Wallpaper Preview */}
              {wallpaper.imageUrl && (
                <View style={styles.currentWallpaper}>
                  <Image
                    source={{ uri: wallpaper.imageUrl }}
                    style={styles.currentWallpaperImage}
                    resizeMode="cover"
                  />
                  <View style={styles.currentWallpaperOverlay}>
                    <Text style={styles.currentWallpaperText}>Fond actuel</Text>
                  </View>
                </View>
              )}

              {/* Opacity Slider */}
              {wallpaper.imageUrl && (
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>Luminosité du fond</Text>
                    <Text style={styles.sliderValue}>{Math.round(opacity * 100)}%</Text>
                  </View>
                  {Platform.OS !== 'web' ? (
                    <Slider
                      style={styles.slider}
                      minimumValue={0.1}
                      maximumValue={0.8}
                      value={opacity}
                      onValueChange={(value) => setOpacity(value)}
                      onSlidingComplete={async (value) => {
                        await setWallpaper({
                          ...wallpaper,
                          opacity: value,
                        });
                      }}
                      minimumTrackTintColor="#e63946"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#e63946"
                    />
                  ) : (
                    <View style={styles.webSliderContainer}>
                      <TouchableOpacity
                        style={styles.webSliderButton}
                        onPress={async () => {
                          const newValue = Math.max(0.1, opacity - 0.1);
                          setOpacity(newValue);
                          await setWallpaper({ ...wallpaper, opacity: newValue });
                        }}
                      >
                        <Ionicons name="remove" size={20} color="#fff" />
                      </TouchableOpacity>
                      <View style={styles.webSliderTrack}>
                        <View style={[styles.webSliderFill, { width: `${opacity * 100}%` }]} />
                      </View>
                      <TouchableOpacity
                        style={styles.webSliderButton}
                        onPress={async () => {
                          const newValue = Math.min(0.8, opacity + 0.1);
                          setOpacity(newValue);
                          await setWallpaper({ ...wallpaper, opacity: newValue });
                        }}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.wallpaperActions}>
                <TouchableOpacity
                  style={styles.chooseButton}
                  onPress={() => setShowImagePicker(true)}
                >
                  <Ionicons name="search" size={20} color="#fff" />
                  <Text style={styles.chooseButtonText}>
                    {wallpaper.imageUrl ? 'Changer le fond' : 'Choisir un fond'}
                  </Text>
                </TouchableOpacity>
                
                {wallpaper.imageUrl && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={handleRemoveWallpaper}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.removeButtonText}>Supprimer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* About Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="information-circle" size={22} color="#e63946" />
                <Text style={styles.sectionTitle}>À propos</Text>
              </View>
              <Text style={styles.aboutText}>
                Anime & Manga Tracker v1.0
              </Text>
              <Text style={styles.aboutSubtext}>
                Suivez vos anime et manga préférés
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Image Picker Modal */}
      <Modal
        visible={showImagePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowImagePicker(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowImagePicker(false)}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>Choisir un fond</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un anime..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            {/* Results Grid */}
            <ScrollView style={styles.resultsContainer}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#e63946" />
                  <Text style={styles.loadingText}>Recherche...</Text>
                </View>
              ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="image-outline" size={48} color="#444" />
                  <Text style={styles.emptyText}>Aucun résultat</Text>
                </View>
              ) : searchResults.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search" size={48} color="#444" />
                  <Text style={styles.emptyText}>
                    Recherchez votre anime préféré
                  </Text>
                </View>
              ) : (
                <View style={styles.imageGrid}>
                  {searchResults.map((item) => (
                    <TouchableOpacity
                      key={item.mal_id}
                      style={[
                        styles.imageItem,
                        selectedImage === item.image_url && styles.imageItemSelected,
                      ]}
                      onPress={() => handleSelectImage(item.image_url)}
                    >
                      <Image
                        source={{ uri: item.image_url }}
                        style={styles.gridImage}
                        resizeMode="cover"
                      />
                      {selectedImage === item.image_url && (
                        <View style={styles.selectedOverlay}>
                          <Ionicons name="checkmark-circle" size={32} color="#e63946" />
                        </View>
                      )}
                      <Text style={styles.imageTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Apply Button */}
            {selectedImage && (
              <View style={styles.applyContainer}>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={handleApplyWallpaper}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.applyButtonText}>Appliquer ce fond</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  currentWallpaper: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  currentWallpaperImage: {
    width: '100%',
    height: '100%',
  },
  currentWallpaperOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  currentWallpaperText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#ccc',
  },
  sliderValue: {
    fontSize: 14,
    color: '#e63946',
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  webSliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  webSliderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webSliderTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  webSliderFill: {
    height: '100%',
    backgroundColor: '#e63946',
    borderRadius: 4,
  },
  wallpaperActions: {
    flexDirection: 'row',
    gap: 12,
  },
  chooseButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e63946',
    paddingVertical: 14,
    borderRadius: 12,
  },
  chooseButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#333',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  aboutText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  aboutSubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  // Picker Modal Styles
  pickerContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#888',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 100,
  },
  imageItem: {
    width: (SCREEN_WIDTH - 56) / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#252525',
  },
  imageItemSelected: {
    borderWidth: 2,
    borderColor: '#e63946',
  },
  gridImage: {
    width: '100%',
    aspectRatio: 2/3,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageTitle: {
    padding: 6,
    fontSize: 11,
    color: '#ccc',
    textAlign: 'center',
  },
  applyContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e63946',
    paddingVertical: 16,
    borderRadius: 12,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
