import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useFocusEffect } from 'expo-router';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MediaItem {
  mal_id: number;
  title: string;
  title_english: string | null;
  image_url: string | null;
  synopsis: string | null;
  score: number | null;
  episodes: number | null;
  chapters: number | null;
  media_type: string;
  genres?: string[];
  rank?: number;
}

interface Stats {
  total_items: number;
  total_anime: number;
  total_manga: number;
  watched_count: number;
  watchlist_count: number;
  total_episodes: number;
  total_chapters: number;
  average_score: number;
  average_user_rating: number;
  estimated_watch_time_hours: number;
  top_rated: any[];
  recently_added: any[];
}

export default function DiscoverScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [seasonal, setSeasonal] = useState<MediaItem[]>([]);
  const [randomSuggestion, setRandomSuggestion] = useState<MediaItem | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingSeasonal, setLoadingSeasonal] = useState(true);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [trendingFilter, setTrendingFilter] = useState<'airing' | 'popular' | 'upcoming'>('airing');

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/library/stats`);
      setStats(response.data);
    } catch (error) {
      console.log('Stats fetch error');
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTrending = async (filter: string = 'airing') => {
    setLoadingTrending(true);
    try {
      const response = await axios.get(`${API_BASE}/api/trending/anime?filter=${filter}`);
      setTrending(response.data.data);
    } catch (error) {
      console.log('Trending fetch error');
    } finally {
      setLoadingTrending(false);
    }
  };

  const fetchSeasonal = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/seasonal`);
      setSeasonal(response.data.data);
    } catch (error) {
      console.log('Seasonal fetch error');
    } finally {
      setLoadingSeasonal(false);
    }
  };

  const getRandomSuggestion = async () => {
    setLoadingRandom(true);
    try {
      const response = await axios.get(`${API_BASE}/api/library/random`);
      setRandomSuggestion(response.data.suggestion);
    } catch (error) {
      console.log('Random fetch error');
    } finally {
      setLoadingRandom(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
      fetchTrending(trendingFilter);
      fetchSeasonal();
    }, [])
  );

  useEffect(() => {
    fetchTrending(trendingFilter);
  }, [trendingFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchStats(), fetchTrending(trendingFilter), fetchSeasonal()]).finally(() => {
      setRefreshing(false);
    });
  }, [trendingFilter]);

  const openModal = (item: MediaItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const addToLibrary = async (item: MediaItem, status: 'watched' | 'watchlist') => {
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
        genres: item.genres,
      });
      setModalVisible(false);
    } catch (error: any) {
      if (error.response?.status === 400) {
        // Already in library
      }
    } finally {
      setAddingToLibrary(false);
    }
  };

  const formatWatchTime = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}j ${remainingHours}h`;
  };

  const renderStatCard = (icon: string, value: string | number, label: string, color: string) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderTrendingCard = (item: MediaItem, index: number) => (
    <TouchableOpacity
      key={item.mal_id}
      style={styles.trendingCard}
      onPress={() => openModal(item)}
      activeOpacity={0.8}
    >
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>
      <Image
        source={{ uri: item.image_url || 'https://via.placeholder.com/120x180' }}
        style={styles.trendingImage}
        resizeMode="cover"
      />
      <View style={styles.trendingOverlay}>
        <Text style={styles.trendingTitle} numberOfLines={2}>
          {item.title_english || item.title}
        </Text>
        {item.score && (
          <View style={styles.trendingScore}>
            <Ionicons name="star" size={12} color="#ffd700" />
            <Text style={styles.trendingScoreText}>{item.score.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSeasonalCard = (item: MediaItem) => (
    <TouchableOpacity
      key={item.mal_id}
      style={styles.seasonalCard}
      onPress={() => openModal(item)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.image_url || 'https://via.placeholder.com/100x150' }}
        style={styles.seasonalImage}
        resizeMode="cover"
      />
      <Text style={styles.seasonalTitle} numberOfLines={2}>
        {item.title_english || item.title}
      </Text>
      {item.score && (
        <View style={styles.seasonalScore}>
          <Ionicons name="star" size={10} color="#ffd700" />
          <Text style={styles.seasonalScoreText}>{item.score.toFixed(1)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e63946" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Découvrir</Text>
          <Text style={styles.headerSubtitle}>Statistiques & Tendances</Text>
        </View>

        {/* Stats Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart" size={20} color="#e63946" />
            <Text style={styles.sectionTitle}>Mes Statistiques</Text>
          </View>
          
          {loadingStats ? (
            <ActivityIndicator size="small" color="#e63946" style={{ padding: 20 }} />
          ) : stats ? (
            <View style={styles.statsGrid}>
              {renderStatCard('film', stats.total_anime, 'Anime', '#e63946')}
              {renderStatCard('book', stats.total_manga, 'Manga', '#457b9d')}
              {renderStatCard('checkmark-circle', stats.watched_count, 'Vus', '#4caf50')}
              {renderStatCard('time', stats.watchlist_count, 'À voir', '#ff9800')}
              {renderStatCard('play', stats.total_episodes, 'Épisodes', '#9c27b0')}
              {renderStatCard('hourglass', formatWatchTime(stats.estimated_watch_time_hours), 'Temps', '#00bcd4')}
            </View>
          ) : (
            <Text style={styles.emptyText}>Aucune donnée</Text>
          )}
        </View>

        {/* Random Suggestion Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="dice" size={20} color="#e63946" />
            <Text style={styles.sectionTitle}>Que regarder ce soir ?</Text>
          </View>
          
          <TouchableOpacity
            style={styles.randomButton}
            onPress={getRandomSuggestion}
            disabled={loadingRandom}
          >
            {loadingRandom ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="shuffle" size={20} color="#fff" />
                <Text style={styles.randomButtonText}>Suggestion aléatoire</Text>
              </>
            )}
          </TouchableOpacity>

          {randomSuggestion && (
            <TouchableOpacity
              style={styles.suggestionCard}
              onPress={() => openModal(randomSuggestion)}
            >
              <Image
                source={{ uri: randomSuggestion.image_url || 'https://via.placeholder.com/80x120' }}
                style={styles.suggestionImage}
                resizeMode="cover"
              />
              <View style={styles.suggestionContent}>
                <Text style={styles.suggestionTitle} numberOfLines={2}>
                  {randomSuggestion.title_english || randomSuggestion.title}
                </Text>
                <Text style={styles.suggestionSubtitle}>
                  Dans votre liste "À voir"
                </Text>
                {randomSuggestion.score && (
                  <View style={styles.suggestionScore}>
                    <Ionicons name="star" size={14} color="#ffd700" />
                    <Text style={styles.suggestionScoreText}>{randomSuggestion.score.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={24} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        {/* Trending Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={20} color="#e63946" />
            <Text style={styles.sectionTitle}>Tendances Anime</Text>
          </View>

          <View style={styles.filterRow}>
            {(['airing', 'popular', 'upcoming'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  trendingFilter === filter && styles.filterChipActive,
                ]}
                onPress={() => setTrendingFilter(filter)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    trendingFilter === filter && styles.filterChipTextActive,
                  ]}
                >
                  {filter === 'airing' ? 'En cours' : filter === 'popular' ? 'Populaires' : 'À venir'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingTrending ? (
            <ActivityIndicator size="small" color="#e63946" style={{ padding: 20 }} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
            >
              {trending.map((item, index) => renderTrendingCard(item, index))}
            </ScrollView>
          )}
        </View>

        {/* Seasonal Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={20} color="#e63946" />
            <Text style={styles.sectionTitle}>Cette Saison</Text>
          </View>

          {loadingSeasonal ? (
            <ActivityIndicator size="small" color="#e63946" style={{ padding: 20 }} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
            >
              {seasonal.map(renderSeasonalCard)}
            </ScrollView>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

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

                <Text style={styles.modalTitle}>
                  {selectedItem.title_english || selectedItem.title}
                </Text>

                {selectedItem.title_english && selectedItem.title_english !== selectedItem.title && (
                  <Text style={styles.modalSubtitle}>{selectedItem.title}</Text>
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
                </View>

                {selectedItem.genres && selectedItem.genres.length > 0 && (
                  <View style={styles.genresContainer}>
                    {selectedItem.genres.slice(0, 4).map((genre, index) => (
                      <View key={index} style={styles.genreBadge}>
                        <Text style={styles.genreText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {selectedItem.synopsis && (
                  <Text style={styles.modalSynopsis} numberOfLines={6}>
                    {selectedItem.synopsis}
                  </Text>
                )}

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
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
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
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: (SCREEN_WIDTH - 60) / 3,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  randomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e63946',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  randomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  suggestionImage: {
    width: 60,
    height: 90,
    borderRadius: 8,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  suggestionSubtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  suggestionScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  suggestionScoreText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  filterChipActive: {
    backgroundColor: '#e63946',
  },
  filterChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  horizontalScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  trendingCard: {
    width: 140,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  rankBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    backgroundColor: '#e63946',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  trendingImage: {
    width: 140,
    height: 200,
  },
  trendingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  trendingTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  trendingScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendingScoreText: {
    color: '#ffd700',
    fontSize: 12,
  },
  seasonalCard: {
    width: 110,
    marginRight: 12,
  },
  seasonalImage: {
    width: 110,
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
  },
  seasonalTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  seasonalScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  seasonalScoreText: {
    color: '#ffd700',
    fontSize: 11,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
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
    maxHeight: '85%',
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
    height: 250,
    borderRadius: 16,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
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
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  genreBadge: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreText: {
    color: '#aaa',
    fontSize: 12,
  },
  modalSynopsis: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
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
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
