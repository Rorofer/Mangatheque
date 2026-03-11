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
  relation_type?: string;
}

interface Translation {
  title_fr: string;
  synopsis_fr: string | null;
}

const RELATION_TYPES_FR: {[key: string]: string} = {
  'Sequel': 'Suite',
  'Prequel': 'Préquelle',
  'Parent story': 'Histoire principale',
  'Side story': 'Histoire parallèle',
  'Summary': 'Résumé',
  'Full story': 'Histoire complète',
  'Spin-off': 'Spin-off',
  'Alternative version': 'Version alternative',
  'Alternative setting': 'Univers alternatif',
  'Other': 'Autre',
};

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
  const [titleTranslations, setTitleTranslations] = useState<{[key: string]: string}>({});
  const [translatingTitles, setTranslatingTitles] = useState(false);
  const [relatedItems, setRelatedItems] = useState<MediaItem[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [relatedTranslations, setRelatedTranslations] = useState<{[key: string]: string}>({});
  const [addingRelatedId, setAddingRelatedId] = useState<number | null>(null);

  const search = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    setTitleTranslations({});
    
    try {
      const response = await axios.get(
        `${API_BASE}/api/search/${mediaType}`,
        { params: { q: searchQuery, limit: 20 }, timeout: 30000 }
      );
      const searchResults = response.data.data;
      setResults(searchResults);
      
      // Fetch library items and build status map
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
        setLibraryStatus({});
      }
      
      // Batch translate titles
      if (searchResults.length > 0) {
        setTranslatingTitles(true);
        try {
          const batchResponse = await axios.post(`${API_BASE}/api/translate/batch`, {
            items: searchResults.map((item: MediaItem) => ({
              mal_id: item.mal_id,
              title: item.title,
              synopsis: null
            }))
          });
          
          const translationsMap: {[key: string]: string} = {};
          for (const [malId, trans] of Object.entries(batchResponse.data.translations)) {
            translationsMap[malId] = (trans as Translation).title_fr;
          }
          setTitleTranslations(translationsMap);
        } catch (error) {
          console.error('Batch translation error:', error);
        } finally {
          setTranslatingTitles(false);
        }
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

  const fetchRelations = async (item: MediaItem) => {
    setLoadingRelations(true);
    setRelatedItems([]);
    setRelatedTranslations({});
    
    try {
      const response = await axios.get(
        `${API_BASE}/api/relations/${item.media_type}/${item.mal_id}`,
        { timeout: 60000 }
      );
      const relations = response.data.data;
      setRelatedItems(relations);
      
      // Update library status for related items
      try {
        const libraryResponse = await axios.get(`${API_BASE}/api/library`);
        const libraryItems = libraryResponse.data;
        const statusMap: {[key: string]: LibraryStatus | null} = { ...libraryStatus };
        
        for (const relItem of relations) {
          const libraryItem = libraryItems.find(
            (li: any) => li.mal_id === relItem.mal_id && li.media_type === relItem.media_type
          );
          statusMap[`${relItem.mal_id}-${relItem.media_type}`] = libraryItem ? libraryItem.status : null;
        }
        setLibraryStatus(statusMap);
      } catch {}
      
      // Translate related titles
      if (relations.length > 0) {
        try {
          const batchResponse = await axios.post(`${API_BASE}/api/translate/batch`, {
            items: relations.map((r: MediaItem) => ({
              mal_id: r.mal_id,
              title: r.title,
              synopsis: null
            }))
          });
          
          const translationsMap: {[key: string]: string} = {};
          for (const [malId, trans] of Object.entries(batchResponse.data.translations)) {
            translationsMap[malId] = (trans as Translation).title_fr;
          }
          setRelatedTranslations(translationsMap);
        } catch {}
      }
    } catch (error) {
      console.error('Relations error:', error);
    } finally {
      setLoadingRelations(false);
    }
  };

  const openModal = async (item: MediaItem) => {
    setSelectedItem(item);
    setRelatedItems([]);
    setRelatedTranslations({});
    // Use cached title translation if available
    const cachedTitle = titleTranslations[String(item.mal_id)];
    if (cachedTitle) {
      setTranslation({ title_fr: cachedTitle, synopsis_fr: null });
    } else {
      setTranslation(null);
    }
    setModalVisible(true);
    // Fetch full translation including synopsis
    translateContent(item);
    // Fetch related anime/manga
    fetchRelations(item);
  };

  const addToLibrary = async (item: MediaItem, status: LibraryStatus, isRelated: boolean = false) => {
    if (isRelated) {
      setAddingRelatedId(item.mal_id);
    } else {
      setAddingToLibrary(true);
    }
    
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
      
      if (!isRelated) {
        // Don't close modal if adding related item
        setModalVisible(false);
      }
    } catch (error: any) {
      if (error.response?.status === 400) {
        if (Platform.OS === 'web') {
          window.alert('Cet élément est déjà dans votre bibliothèque');
        }
      } else {
        console.error('Add to library error:', error);
        if (Platform.OS === 'web') {
          window.alert('Erreur lors de l\'ajout');
        }
      }
    } finally {
      if (isRelated) {
        setAddingRelatedId(null);
      } else {
        setAddingToLibrary(false);
      }
    }
  };

  const addAllToLibrary = async (status: LibraryStatus) => {
    if (!selectedItem) return;
    
    setAddingToLibrary(true);
    
    // Add main item first
    const itemsToAdd = [selectedItem, ...relatedItems];
    
    for (const item of itemsToAdd) {
      const existingStatus = libraryStatus[`${item.mal_id}-${item.media_type}`];
      if (!existingStatus) {
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
        } catch (error: any) {
          console.error('Add error:', error);
        }
      }
    }
    
    setAddingToLibrary(false);
    setModalVisible(false);
  };

  const getCardTitle = (item: MediaItem) => {
    const translatedTitle = titleTranslations[String(item.mal_id)];
    if (translatedTitle) return translatedTitle;
    if (item.title_english) return item.title_english;
    return item.title;
  };

  const getRelatedTitle = (item: MediaItem) => {
    const translatedTitle = relatedTranslations[String(item.mal_id)];
    if (translatedTitle) return translatedTitle;
    if (item.title_english) return item.title_english;
    return item.title;
  };

  const renderItem = ({ item }: { item: MediaItem }) => {
    const itemStatus = libraryStatus[`${item.mal_id}-${item.media_type}`];
    const displayTitle = getCardTitle(item);
    const showOriginalTitle = titleTranslations[String(item.mal_id)] && 
                              titleTranslations[String(item.mal_id)] !== item.title;
    
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
            {displayTitle}
          </Text>
          {showOriginalTitle && (
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {item.title}
            </Text>
          )}
          {!showOriginalTitle && item.title_english && item.title_english !== item.title && (
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

  // Get display title and synopsis for modal (prefer French translation)
  const getDisplayTitle = () => {
    if (translation?.title_fr) return translation.title_fr;
    if (selectedItem?.title_english) return selectedItem.title_english;
    return selectedItem?.title || '';
  };

  const getDisplaySynopsis = () => {
    if (translation?.synopsis_fr) return translation.synopsis_fr;
    return selectedItem?.synopsis || '';
  };

  const renderRelatedItem = (item: MediaItem) => {
    const itemStatus = libraryStatus[`${item.mal_id}-${item.media_type}`];
    const displayTitle = getRelatedTitle(item);
    const isAdding = addingRelatedId === item.mal_id;
    
    return (
      <View key={item.mal_id} style={styles.relatedCard}>
        <Image
          source={{ uri: item.image_url || 'https://via.placeholder.com/60x90' }}
          style={styles.relatedImage}
          resizeMode="cover"
        />
        <View style={styles.relatedContent}>
          <View style={styles.relatedTypeContainer}>
            <Text style={styles.relatedType}>
              {RELATION_TYPES_FR[item.relation_type || ''] || item.relation_type}
            </Text>
          </View>
          <Text style={styles.relatedTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          <View style={styles.relatedMeta}>
            {item.score && (
              <View style={styles.relatedScoreBadge}>
                <Ionicons name="star" size={10} color="#ffd700" />
                <Text style={styles.relatedScoreText}>{item.score.toFixed(1)}</Text>
              </View>
            )}
            {item.episodes && (
              <Text style={styles.relatedMetaText}>{item.episodes} ép.</Text>
            )}
          </View>
        </View>
        <View style={styles.relatedActions}>
          {itemStatus ? (
            <View style={[
              styles.relatedStatusBadge,
              itemStatus === 'watched' ? styles.watchedBadge : styles.watchlistBadge
            ]}>
              <Ionicons 
                name={itemStatus === 'watched' ? 'checkmark' : 'time'} 
                size={14} 
                color="#fff" 
              />
            </View>
          ) : (
            <View style={styles.relatedButtonsContainer}>
              <TouchableOpacity
                style={[styles.relatedButton, styles.watchedButtonSmall]}
                onPress={() => addToLibrary(item, 'watched', true)}
                disabled={isAdding}
              >
                {isAdding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.relatedButton, styles.watchlistButtonSmall]}
                onPress={() => addToLibrary(item, 'watchlist', true)}
                disabled={isAdding}
              >
                <Ionicons name="time" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
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
            <>
              {translatingTitles && (
                <View style={styles.translatingBanner}>
                  <ActivityIndicator size="small" color="#e63946" />
                  <Text style={styles.translatingBannerText}>Traduction des titres...</Text>
                </View>
              )}
              <FlashList
                data={results}
                renderItem={renderItem}
                estimatedItemSize={130}
                keyExtractor={(item) => `${item.mal_id}-${item.media_type}`}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                extraData={titleTranslations}
              />
            </>
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
                      {translating && !translation?.synopsis_fr ? (
                        <View style={styles.translatingContainer}>
                          <ActivityIndicator size="small" color="#e63946" />
                          <Text style={styles.translatingText}>Traduction en cours...</Text>
                        </View>
                      ) : (
                        <Text style={styles.modalSynopsis}>{getDisplaySynopsis()}</Text>
                      )}
                    </View>
                  )}
                  
                  {/* Related Items Section */}
                  {(loadingRelations || relatedItems.length > 0) && (
                    <View style={styles.relatedSection}>
                      <View style={styles.relatedHeader}>
                        <Ionicons name="git-branch" size={20} color="#e63946" />
                        <Text style={styles.relatedSectionTitle}>
                          Franchise / Série ({relatedItems.length})
                        </Text>
                      </View>
                      
                      {loadingRelations ? (
                        <View style={styles.relatedLoading}>
                          <ActivityIndicator size="small" color="#e63946" />
                          <Text style={styles.relatedLoadingText}>Chargement des épisodes liés...</Text>
                        </View>
                      ) : (
                        <>
                          {relatedItems.map(renderRelatedItem)}
                          
                          {/* Add all button */}
                          {relatedItems.some(item => !libraryStatus[`${item.mal_id}-${item.media_type}`]) && (
                            <View style={styles.addAllContainer}>
                              <TouchableOpacity
                                style={[styles.addAllButton, styles.watchedButton]}
                                onPress={() => addAllToLibrary('watched')}
                                disabled={addingToLibrary}
                              >
                                {addingToLibrary ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <>
                                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                                    <Text style={styles.addAllButtonText}>Tout marquer comme vu</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.addAllButton, styles.watchlistButton]}
                                onPress={() => addAllToLibrary('watchlist')}
                                disabled={addingToLibrary}
                              >
                                <Ionicons name="time" size={18} color="#fff" />
                                <Text style={styles.addAllButtonText}>Tout à voir</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </>
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
  translatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  translatingBannerText: {
    color: '#888',
    fontSize: 13,
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
    fontStyle: 'italic',
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
  // Related Items Styles
  relatedSection: {
    marginBottom: 20,
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  relatedSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  relatedLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  relatedLoadingText: {
    color: '#888',
    fontSize: 14,
  },
  relatedCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  relatedImage: {
    width: 60,
    height: 85,
  },
  relatedContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  relatedTypeContainer: {
    marginBottom: 4,
  },
  relatedType: {
    fontSize: 11,
    color: '#e63946',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  relatedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  relatedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  relatedScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  relatedScoreText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '600',
  },
  relatedMetaText: {
    color: '#888',
    fontSize: 12,
  },
  relatedActions: {
    justifyContent: 'center',
    paddingRight: 10,
  },
  relatedStatusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  relatedButtonsContainer: {
    flexDirection: 'column',
    gap: 6,
  },
  relatedButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchedButtonSmall: {
    backgroundColor: '#4caf50',
  },
  watchlistButtonSmall: {
    backgroundColor: '#ff9800',
  },
  addAllContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  addAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addAllButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
