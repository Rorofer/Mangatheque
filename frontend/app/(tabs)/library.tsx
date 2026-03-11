import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import axios from 'axios';
import { useFocusEffect } from 'expo-router';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

type MediaType = 'anime' | 'manga';
type LibraryStatus = 'watched' | 'watchlist';
type SortOption = 'date_added' | 'title' | 'score' | 'date_updated';

interface LibraryItem {
  id: string;
  mal_id: number;
  media_type: MediaType;
  title: string;
  title_english: string | null;
  image_url: string | null;
  synopsis: string | null;
  score: number | null;
  episodes: number | null;
  chapters: number | null;
  status: LibraryStatus;
  created_at: string;
  updated_at: string;
}

interface Translation {
  title_fr: string;
  synopsis_fr: string | null;
}

type FilterType = 'all' | 'watched' | 'watchlist';
type MediaFilterType = 'all' | 'anime' | 'manga';

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'date_added', label: 'Date d\'ajout', icon: 'calendar' },
  { key: 'date_updated', label: 'Dernière modification', icon: 'time' },
  { key: 'title', label: 'Titre A-Z', icon: 'text' },
  { key: 'score', label: 'Note', icon: 'star' },
];

export default function LibraryScreen() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [mediaFilter, setMediaFilter] = useState<MediaFilterType>('all');
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [translating, setTranslating] = useState(false);
  const [titleTranslations, setTitleTranslations] = useState<{[key: string]: string}>({});
  const [translatingTitles, setTranslatingTitles] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>('date_added');
  const [showSortModal, setShowSortModal] = useState(false);

  const translateLibraryTitles = useCallback(async (libraryItems: LibraryItem[]) => {
    if (libraryItems.length === 0) return;
    
    setTranslatingTitles(true);
    try {
      const batchResponse = await axios.post(`${API_BASE}/api/translate/batch`, {
        items: libraryItems.map((item) => ({
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
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (mediaFilter !== 'all') params.media_type = mediaFilter;
      
      const response = await axios.get(`${API_BASE}/api/library`, { params });
      const libraryItems = response.data;
      setItems(libraryItems);
      
      // Translate titles
      if (libraryItems.length > 0) {
        translateLibraryTitles(libraryItems);
      }
    } catch (error) {
      console.error('Fetch library error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, mediaFilter, translateLibraryTitles]);

  useFocusEffect(
    useCallback(() => {
      fetchLibrary();
    }, [fetchLibrary])
  );

  useEffect(() => {
    fetchLibrary();
  }, [statusFilter, mediaFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTitleTranslations({});
    fetchLibrary();
  }, [fetchLibrary]);

  const sortItems = useCallback((itemsToSort: LibraryItem[], sort: SortOption): LibraryItem[] => {
    const sorted = [...itemsToSort];
    switch (sort) {
      case 'score':
        return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
      case 'title':
        return sorted.sort((a, b) => {
          const titleA = titleTranslations[String(a.mal_id)] || a.title_english || a.title;
          const titleB = titleTranslations[String(b.mal_id)] || b.title_english || b.title;
          return titleA.localeCompare(titleB, 'fr');
        });
      case 'date_added':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'date_updated':
        return sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      default:
        return sorted;
    }
  }, [titleTranslations]);

  const translateContent = async (item: LibraryItem) => {
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

  const openModal = async (item: LibraryItem) => {
    setSelectedItem(item);
    // Use cached title translation if available
    const cachedTitle = titleTranslations[String(item.mal_id)];
    if (cachedTitle) {
      setTranslation({ title_fr: cachedTitle, synopsis_fr: null });
    } else {
      setTranslation(null);
    }
    setModalVisible(true);
    translateContent(item);
  };

  const updateItemStatus = async (item: LibraryItem, newStatus: LibraryStatus) => {
    setUpdating(true);
    try {
      await axios.put(`${API_BASE}/api/library/${item.id}`, {
        status: newStatus,
      });
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, status: newStatus, updated_at: new Date().toISOString() } : i
      ));
      setSelectedItem(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (error) {
      console.error('Update error:', error);
      if (Platform.OS === 'web') {
        window.alert('Impossible de mettre à jour le statut');
      }
    } finally {
      setUpdating(false);
    }
  };

  const deleteItem = async () => {
    if (!selectedItem) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE}/api/library/${selectedItem.id}`);
      setItems(prev => prev.filter(i => i.id !== selectedItem.id));
      setConfirmDeleteVisible(false);
      setModalVisible(false);
    } catch (error) {
      console.error('Delete error:', error);
      if (Platform.OS === 'web') {
        window.alert('Impossible de supprimer l\'élément');
      }
    } finally {
      setDeleting(false);
    }
  };

  const getCardTitle = (item: LibraryItem) => {
    const translatedTitle = titleTranslations[String(item.mal_id)];
    if (translatedTitle) return translatedTitle;
    if (item.title_english) return item.title_english;
    return item.title;
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

  // Get sorted items
  const sortedItems = sortItems(items, sortBy);

  const renderItem = ({ item }: { item: LibraryItem }) => {
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
          <View style={styles.cardHeader}>
            <View style={[
              styles.typeBadge,
              item.media_type === 'anime' ? styles.animeBadge : styles.mangaBadge
            ]}>
              <Text style={styles.typeBadgeText}>
                {item.media_type === 'anime' ? 'Anime' : 'Manga'}
              </Text>
            </View>
          </View>
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
              <Text style={styles.metaText}>{item.episodes} ép.</Text>
            )}
            {item.chapters && (
              <Text style={styles.metaText}>{item.chapters} ch.</Text>
            )}
          </View>
          <View style={[
            styles.statusBadge,
            item.status === 'watched' ? styles.watchedBadge : styles.watchlistBadge
          ]}>
            <Ionicons 
              name={item.status === 'watched' ? 'checkmark-circle' : 'time'} 
              size={12} 
              color="#fff" 
            />
            <Text style={styles.statusText}>
              {item.status === 'watched' ? 'Vu' : 'À voir'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredCount = items.length;
  const watchedCount = items.filter(i => i.status === 'watched').length;
  const watchlistCount = items.filter(i => i.status === 'watchlist').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ma Bibliothèque</Text>
        <Text style={styles.headerSubtitle}>
          {filteredCount} élément{filteredCount !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Status Filter */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === 'all' && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[
              styles.filterText,
              statusFilter === 'all' && styles.filterTextActive,
            ]}>
              Tous
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === 'watched' && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter('watched')}
          >
            <Ionicons 
              name="checkmark-circle" 
              size={16} 
              color={statusFilter === 'watched' ? '#fff' : '#888'} 
            />
            <Text style={[
              styles.filterText,
              statusFilter === 'watched' && styles.filterTextActive,
            ]}>
              Vus ({watchedCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === 'watchlist' && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter('watchlist')}
          >
            <Ionicons 
              name="time" 
              size={16} 
              color={statusFilter === 'watchlist' ? '#fff' : '#888'} 
            />
            <Text style={[
              styles.filterText,
              statusFilter === 'watchlist' && styles.filterTextActive,
            ]}>
              À voir ({watchlistCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Media Type Filter + Sort */}
      <View style={styles.filtersRow}>
        <View style={styles.mediaFilterContainer}>
          <TouchableOpacity
            style={[
              styles.mediaFilterButton,
              mediaFilter === 'all' && styles.mediaFilterButtonActive,
            ]}
            onPress={() => setMediaFilter('all')}
          >
            <Text style={[
              styles.mediaFilterText,
              mediaFilter === 'all' && styles.mediaFilterTextActive,
            ]}>
              Tous
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.mediaFilterButton,
              mediaFilter === 'anime' && styles.mediaFilterButtonActive,
            ]}
            onPress={() => setMediaFilter('anime')}
          >
            <Text style={[
              styles.mediaFilterText,
              mediaFilter === 'anime' && styles.mediaFilterTextActive,
            ]}>
              Anime
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.mediaFilterButton,
              mediaFilter === 'manga' && styles.mediaFilterButtonActive,
            ]}
            onPress={() => setMediaFilter('manga')}
          >
            <Text style={[
              styles.mediaFilterText,
              mediaFilter === 'manga' && styles.mediaFilterTextActive,
            ]}>
              Manga
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Sort Button */}
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setShowSortModal(true)}
        >
          <Ionicons name={SORT_OPTIONS.find(o => o.key === sortBy)?.icon as any || 'swap-vertical'} size={16} color="#e63946" />
          <Ionicons name="chevron-down" size={14} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Library List */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#e63946" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="library-outline" size={64} color="#444" />
            <Text style={styles.emptyText}>
              {statusFilter === 'all' && mediaFilter === 'all'
                ? 'Votre bibliothèque est vide'
                : 'Aucun élément trouvé avec ces filtres'}
            </Text>
            <Text style={styles.emptySubtext}>
              Recherchez des anime et manga pour les ajouter
            </Text>
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
              data={sortedItems}
              renderItem={renderItem}
              estimatedItemSize={150}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              extraData={{ titleTranslations, sortBy }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#e63946"
                />
              }
            />
          </>
        )}
      </View>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={styles.sortModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>Trier par</Text>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortModalOption,
                  sortBy === option.key && styles.sortModalOptionActive,
                ]}
                onPress={() => {
                  setSortBy(option.key);
                  setShowSortModal(false);
                }}
              >
                <Ionicons
                  name={option.icon as any}
                  size={20}
                  color={sortBy === option.key ? '#e63946' : '#888'}
                />
                <Text style={[
                  styles.sortModalOptionText,
                  sortBy === option.key && styles.sortModalOptionTextActive,
                ]}>
                  {option.label}
                </Text>
                {sortBy === option.key && (
                  <Ionicons name="checkmark" size={20} color="#e63946" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

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
                <View style={[
                  styles.modalTypeBadge,
                  selectedItem.media_type === 'anime' ? styles.animeBadge : styles.mangaBadge
                ]}>
                  <Text style={styles.typeBadgeText}>
                    {selectedItem.media_type === 'anime' ? 'Anime' : 'Manga'}
                  </Text>
                </View>
                
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

                <View style={[
                  styles.currentStatusBadge,
                  selectedItem.status === 'watched' ? styles.watchedBadge : styles.watchlistBadge
                ]}>
                  <Ionicons 
                    name={selectedItem.status === 'watched' ? 'checkmark-circle' : 'time'} 
                    size={16} 
                    color="#fff" 
                  />
                  <Text style={styles.currentStatusText}>
                    Statut actuel: {selectedItem.status === 'watched' ? 'Vu' : 'À voir'}
                  </Text>
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
                
                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  {selectedItem.status === 'watchlist' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.watchedButton]}
                      onPress={() => updateItemStatus(selectedItem, 'watched')}
                      disabled={updating}
                    >
                      {updating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>Marquer comme vu</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.watchlistButton]}
                      onPress={() => updateItemStatus(selectedItem, 'watchlist')}
                      disabled={updating}
                    >
                      {updating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="time" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>Remettre à voir</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => setConfirmDeleteVisible(true)}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={confirmDeleteVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setConfirmDeleteVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContent}>
            <View style={styles.confirmIconContainer}>
              <Ionicons name="warning" size={48} color="#d32f2f" />
            </View>
            <Text style={styles.confirmTitle}>Confirmer la suppression</Text>
            <Text style={styles.confirmMessage}>
              Voulez-vous vraiment supprimer "{getDisplayTitle()}" de votre bibliothèque ?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={() => setConfirmDeleteVisible(false)}
                disabled={deleting}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDeleteButton]}
                onPress={deleteItem}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    marginRight: 10,
  },
  filterButtonActive: {
    backgroundColor: '#e63946',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  filterTextActive: {
    color: '#fff',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 10,
  },
  mediaFilterContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  mediaFilterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  mediaFilterButtonActive: {
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: '#e63946',
  },
  mediaFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  mediaFilterTextActive: {
    color: '#e63946',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sortModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 300,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  sortModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  sortModalOptionActive: {
    backgroundColor: '#252525',
  },
  sortModalOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#888',
  },
  sortModalOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 12,
    color: '#666',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    color: '#555',
    fontSize: 14,
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
    height: 150,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  animeBadge: {
    backgroundColor: '#e63946',
  },
  mangaBadge: {
    backgroundColor: '#457b9d',
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
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
    marginBottom: 12,
  },
  modalTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
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
    marginBottom: 12,
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
  currentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  currentStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Confirm Delete Modal Styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  confirmIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#333',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmDeleteButton: {
    backgroundColor: '#d32f2f',
  },
  confirmDeleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
