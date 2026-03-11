import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import axios from 'axios';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type MediaType = 'anime' | 'manga';
type LibraryStatus = 'watched' | 'watchlist';

interface MediaItem {
  mal_id: number;
  title: string;
  title_english: string | null;
  image_url: string | null;
  synopsis: string | null;
  score: number | null;
  episodes: number | null;
  chapters: number | null;
  media_type: MediaType;
  status: string | null;
  aired: string | null;
  published: string | null;
}

interface Translation {
  title_fr: string;
  synopsis_fr: string | null;
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('anime');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<{[key: string]: LibraryStatus | null}>({});
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [translating, setTranslating] = useState(false);

  const search = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    
    try {
      const response = await axios.get(
        `${API_BASE}/api/search/${mediaType}`,
        { params: { q: searchQuery, limit: 20 }, timeout: 30000 }
      );
      const searchResults = response.data.data;
      setResults(searchResults);
      
      // Fetch library items once and build status map
      try {
        const libraryResponse = await axios.get(`${API_BASE}/api/library`);
        const libraryItems = libraryResponse.data;
        const statusMap: {[key: string]: LibraryStatus | null} = {};
        
        for (const item of searchResults) {
          const libraryItem = libraryItems.find(
            (li: any) => li.mal_id === item.mal_id && li.media_type === item.media_type
          );
          statusMap[`${item.mal_id}-${item.media_type}`] = libraryItem ? libraryItem.status : null;
        }
        setLibraryStatus(statusMap);
      } catch {
        // Library fetch failed, continue without status
        setLibraryStatus({});
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, mediaType]);

  const translateContent = async (item: MediaItem) => {
    setTranslating(true);
    try {
      const response = await axios.post(`${API_BASE}/api/translate`, {
        title: item.title,
        synopsis: item.synopsis,
        mal_id: item.mal_id,
      });
      setTranslation(response.data);
    } catch (error) {
      console.error('Translation error:', error);
      setTranslation(null);
    } finally {
      setTranslating(false);
    }
  };

  const openModal = async (item: MediaItem) => {
    setSelectedItem(item);
    setTranslation(null);
    setModalVisible(true);
    // Start translation in background
    translateContent(item);
  };

  const addToLibrary = async (item: MediaItem, status: LibraryStatus) => {
    setAddingToLibrary(true);
    try {
      await axios.post(`${API_BASE}/api/library`, {
        mal_id: item.mal_id,
        media_type: item.media_type,
        title: item.title,
        title_english: item.title_english,
        image_url: item.image_url,
        synopsis: item.synopsis,
        score: item.score,
        episodes: item.episodes,
        chapters: item.chapters,
        status: status,
      });
      
      setLibraryStatus(prev => ({
        ...prev,
        [`${item.mal_id}-${item.media_type}`]: status,
      }));
      setModalVisible(false);
    } catch (error: any) {
      if (error.response?.status === 400) {
        alert('Cet élément est déjà dans votre bibliothèque');
      } else {
        console.error('Add to library error:', error);
        alert('Erreur lors de l\'ajout');
      }
    } finally {
      setAddingToLibrary(false);
    }
  };

  const renderItem = ({ item }: { item: MediaItem }) => {
    const itemStatus = libraryStatus[`${item.mal_id}-${item.media_type}`];
    
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openModal(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.image_url || 'https://via.placeholder.com/100x150' }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.title_english && item.title_english !== item.title && (
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {item.title_english}
            </Text>
          )}
          <View style={styles.cardMeta}>
            {item.score && (
              <View style={styles.scoreBadge}>
                <Ionicons name="star" size={12} color="#ffd700" />
                <Text style={styles.scoreText}>{item.score.toFixed(1)}</Text>
              </View>
            )}
            {item.episodes && (
              <Text style={styles.metaText}>{item.episodes} épisodes</Text>
            )}
            {item.chapters && (
              <Text style={styles.metaText}>{item.chapters} chapitres</Text>
            )}
          </View>
          {itemStatus && (
            <View style={[
              styles.statusBadge,
              itemStatus === 'watched' ? styles.watchedBadge : styles.watchlistBadge
            ]}>
              <Ionicons 
                name={itemStatus === 'watched' ? 'checkmark-circle' : 'time'} 
                size={12} 
                color="#fff" 
              />
              <Text style={styles.statusText}>
                {itemStatus === 'watched' ? 'Vu' : 'À voir'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Get display title and synopsis (prefer French translation)
  const getDisplayTitle = () => {
    if (translation?.title_fr) return translation.title_fr;
    if (selectedItem?.title_english) return selectedItem.title_english;
    return selectedItem?.title || '';
  };

  const getDisplaySynopsis = () => {
    if (translation?.synopsis_fr) return translation.synopsis_fr;
    return selectedItem?.synopsis || '';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Anime & Manga Tracker</Text>
        </View>

        {/* Media Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              mediaType === 'anime' && styles.toggleButtonActive,
            ]}
            onPress={() => setMediaType('anime')}
          >
            <Text style={[
              styles.toggleText,
              mediaType === 'anime' && styles.toggleTextActive,
            ]}>
              Anime
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              mediaType === 'manga' && styles.toggleButtonActive,
            ]}
            onPress={() => setMediaType('manga')}
          >
            <Text style={[
              styles.toggleText,
              mediaType === 'manga' && styles.toggleTextActive,
            ]}>
              Manga
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Rechercher un ${mediaType}...`}
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={search}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={search}>
            <Text style={styles.searchButtonText}>Rechercher</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        <View style={styles.resultsContainer}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#e63946" />
              <Text style={styles.loadingText}>Recherche en cours...</Text>
            </View>
          ) : searched && results.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="search-outline" size={64} color="#444" />
              <Text style={styles.emptyText}>Aucun résultat trouvé</Text>
            </View>
          ) : !searched ? (
            <View style={styles.centerContainer}>
              <Ionicons name="film-outline" size={64} color="#444" />
              <Text style={styles.emptyText}>Recherchez vos anime et manga préférés</Text>
            </View>
          ) : (
            <FlashList
              data={results}
              renderItem={renderItem}
              estimatedItemSize={130}
              keyExtractor={(item) => `${item.mal_id}-${item.media_type}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* Detail Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              
              {selectedItem && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Image
                    source={{ uri: selectedItem.image_url || 'https://via.placeholder.com/300x450' }}
                    style={styles.modalImage}
                    resizeMode="cover"
                  />
                  
                  {/* Translated Title */}
                  <View style={styles.titleContainer}>
                    <Text style={styles.modalTitle}>{getDisplayTitle()}</Text>
                    {translating && (
                      <ActivityIndicator size="small" color="#e63946" style={styles.translatingIndicator} />
                    )}
                  </View>
                  
                  {/* Original title if different */}
                  {translation?.title_fr && translation.title_fr !== selectedItem.title && (
                    <Text style={styles.originalTitle}>
                      Titre original: {selectedItem.title}
                    </Text>
                  )}
                  
                  <View style={styles.modalMeta}>
                    {selectedItem.score && (
                      <View style={styles.modalMetaItem}>
                        <Ionicons name="star" size={16} color="#ffd700" />
                        <Text style={styles.modalMetaText}>{selectedItem.score.toFixed(1)}</Text>
                      </View>
                    )}
                    {selectedItem.episodes && (
                      <View style={styles.modalMetaItem}>
                        <Ionicons name="play-circle" size={16} color="#e63946" />
                        <Text style={styles.modalMetaText}>{selectedItem.episodes} épisodes</Text>
                      </View>
                    )}
                    {selectedItem.chapters && (
                      <View style={styles.modalMetaItem}>
                        <Ionicons name="book" size={16} color="#e63946" />
                        <Text style={styles.modalMetaText}>{selectedItem.chapters} chapitres</Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Translated Synopsis */}
                  {(getDisplaySynopsis() || translating) && (
                    <View style={styles.synopsisContainer}>
                      {translating && !translation ? (
                        <View style={styles.translatingContainer}>
                          <ActivityIndicator size="small" color="#e63946" />
                          <Text style={styles.translatingText}>Traduction en cours...</Text>
                        </View>
                      ) : (
                        <Text style={styles.modalSynopsis}>{getDisplaySynopsis()}</Text>
                      )}
                    </View>
                  )}
                  
                  {/* Add to Library Buttons */}
                  {!libraryStatus[`${selectedItem.mal_id}-${selectedItem.media_type}`] ? (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.watchedButton]}
                        onPress={() => addToLibrary(selectedItem, 'watched')}
                        disabled={addingToLibrary}
                      >
                        {addingToLibrary ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>Marquer comme vu</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.watchlistButton]}
                        onPress={() => addToLibrary(selectedItem, 'watchlist')}
                        disabled={addingToLibrary}
                      >
                        {addingToLibrary ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="time" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>À voir plus tard</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.alreadyAddedContainer}>
                      <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
                      <Text style={styles.alreadyAddedText}>
                        Déjà dans votre bibliothèque ({libraryStatus[`${selectedItem.mal_id}-${selectedItem.media_type}`] === 'watched' ? 'Vu' : 'À voir'})
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#e63946',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  toggleTextActive: {
    color: '#fff',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  searchButton: {
    backgroundColor: '#e63946',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#888',
    fontSize: 16,
  },
  emptyText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 100,
    height: 140,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '600',
  },
  metaText: {
    color: '#888',
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  watchedBadge: {
    backgroundColor: '#4caf50',
  },
  watchlistBadge: {
    backgroundColor: '#ff9800',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 4,
  },
  modalImage: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    marginBottom: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  translatingIndicator: {
    marginLeft: 8,
  },
  originalTitle: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 12,
  },
  modalMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  modalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalMetaText: {
    color: '#ccc',
    fontSize: 14,
  },
  synopsisContainer: {
    marginBottom: 20,
  },
  translatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  translatingText: {
    color: '#888',
    fontSize: 14,
  },
  modalSynopsis: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 22,
  },
  actionButtons: {
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  watchedButton: {
    backgroundColor: '#4caf50',
  },
  watchlistButton: {
    backgroundColor: '#ff9800',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  alreadyAddedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  alreadyAddedText: {
    color: '#4caf50',
    fontSize: 14,
    fontWeight: '600',
  },
});
