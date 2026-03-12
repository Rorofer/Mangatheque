import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

interface AnimeCard {
  mal_id: number;
  title: string;
  title_english: string | null;
  image_url: string | null;
  synopsis: string | null;
  score: number | null;
  episodes: number | null;
  genres: string[];
  media_type: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function TinderDiscovery({ visible, onClose }: Props) {
  const [cards, setCards] = useState<AnimeCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [libraryIds, setLibraryIds] = useState<Set<number>>(new Set());
  
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-15deg', '0deg', '15deg'],
    extrapolate: 'clamp',
  });
  
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const fetchDiscoverAnime = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch user's library to exclude already added anime
      const libraryResponse = await axios.get(`${API_BASE}/api/library`);
      const libraryMalIds = new Set<number>(libraryResponse.data.map((item: any) => item.mal_id));
      setLibraryIds(libraryMalIds);
      
      // Fetch top anime
      const response = await axios.get(`${API_BASE}/api/trending/anime?filter=bypopularity`);
      const allAnime = response.data.data;
      
      // Filter out anime already in library
      const newAnime = allAnime.filter((anime: AnimeCard) => !libraryMalIds.has(anime.mal_id));
      
      if (newAnime.length < 5) {
        // If we don't have enough, fetch more from seasonal
        const seasonalResponse = await axios.get(`${API_BASE}/api/seasonal`);
        const seasonalAnime = seasonalResponse.data.data.filter(
          (anime: AnimeCard) => !libraryMalIds.has(anime.mal_id) && !newAnime.find((a: AnimeCard) => a.mal_id === anime.mal_id)
        );
        newAnime.push(...seasonalAnime);
      }
      
      setCards(newAnime);
      setCurrentIndex(0);
    } catch (error) {
      console.log('Fetch discover error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchDiscoverAnime();
      position.setValue({ x: 0, y: 0 });
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
        if (gesture.dx > 50) {
          setSwipeDirection('right');
        } else if (gesture.dx < -50) {
          setSwipeDirection('left');
        } else {
          setSwipeDirection(null);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeRight();
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeLeft();
        } else {
          resetPosition();
        }
        setSwipeDirection(null);
      },
    })
  ).current;

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 4,
    }).start();
  };

  const swipeLeft = () => {
    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      nextCard();
    });
  };

  const swipeRight = async () => {
    const currentCard = cards[currentIndex];
    if (currentCard) {
      setAdding(true);
      try {
        await axios.post(`${API_BASE}/api/library`, {
          mal_id: currentCard.mal_id,
          media_type: 'anime',
          title: currentCard.title,
          title_english: currentCard.title_english,
          image_url: currentCard.image_url,
          synopsis: currentCard.synopsis,
          score: currentCard.score,
          episodes: currentCard.episodes,
          status: 'watchlist',
          genres: currentCard.genres,
        });
      } catch (error: any) {
        // Already in library, ignore
      } finally {
        setAdding(false);
      }
    }
    
    Animated.timing(position, {
      toValue: { x: SCREEN_WIDTH + 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      nextCard();
    });
  };

  const superLike = async () => {
    const currentCard = cards[currentIndex];
    if (currentCard) {
      setAdding(true);
      try {
        await axios.post(`${API_BASE}/api/library`, {
          mal_id: currentCard.mal_id,
          media_type: 'anime',
          title: currentCard.title,
          title_english: currentCard.title_english,
          image_url: currentCard.image_url,
          synopsis: currentCard.synopsis,
          score: currentCard.score,
          episodes: currentCard.episodes,
          status: 'watched',
          genres: currentCard.genres,
        });
      } catch (error: any) {
        // Already in library, ignore
      } finally {
        setAdding(false);
      }
    }
    
    Animated.timing(position, {
      toValue: { x: 0, y: -SCREEN_HEIGHT },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      nextCard();
    });
  };

  const nextCard = () => {
    position.setValue({ x: 0, y: 0 });
    setCurrentIndex((prev) => prev + 1);
  };

  const renderCard = (card: AnimeCard, index: number) => {
    if (index < currentIndex) return null;
    
    const isFirst = index === currentIndex;
    const cardStyle = isFirst
      ? {
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate },
          ],
        }
      : {
          transform: [{ scale: 0.95 }],
          top: 10,
        };

    return (
      <Animated.View
        key={card.mal_id}
        style={[styles.card, cardStyle, !isFirst && styles.nextCard]}
        {...(isFirst ? panResponder.panHandlers : {})}
      >
        <Image
          source={{ uri: card.image_url || 'https://via.placeholder.com/300x450' }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        
        {/* Gradient Overlay */}
        <View style={styles.cardGradient} />
        
        {/* Like Label */}
        {isFirst && (
          <Animated.View style={[styles.likeLabel, { opacity: likeOpacity }]}>
            <Text style={styles.likeLabelText}>À VOIR</Text>
          </Animated.View>
        )}
        
        {/* Nope Label */}
        {isFirst && (
          <Animated.View style={[styles.nopeLabel, { opacity: nopeOpacity }]}>
            <Text style={styles.nopeLabelText}>PASSER</Text>
          </Animated.View>
        )}
        
        {/* Card Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {card.title_english || card.title}
          </Text>
          
          <View style={styles.cardMeta}>
            {card.score && (
              <View style={styles.scoreBadge}>
                <Ionicons name="star" size={16} color="#ffd700" />
                <Text style={styles.scoreText}>{card.score.toFixed(1)}</Text>
              </View>
            )}
            {card.episodes && (
              <View style={styles.episodeBadge}>
                <Ionicons name="play-circle" size={16} color="#e63946" />
                <Text style={styles.episodeText}>{card.episodes} ép.</Text>
              </View>
            )}
          </View>
          
          {card.genres && card.genres.length > 0 && (
            <View style={styles.genresContainer}>
              {card.genres.slice(0, 3).map((genre, i) => (
                <View key={i} style={styles.genreBadge}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          )}
          
          {card.synopsis && (
            <Text style={styles.cardSynopsis} numberOfLines={3}>
              {card.synopsis}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  };

  if (!visible) return null;

  const currentCard = cards[currentIndex];
  const hasMoreCards = currentIndex < cards.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="flame" size={24} color="#e63946" />
          <Text style={styles.headerTitle}>Découverte</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchDiscoverAnime}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Cards Container */}
      <View style={styles.cardsContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#e63946" />
            <Text style={styles.loadingText}>Chargement des anime...</Text>
          </View>
        ) : !hasMoreCards ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-dislike" size={64} color="#444" />
            <Text style={styles.emptyText}>Plus d'anime à découvrir !</Text>
            <Text style={styles.emptySubtext}>Revenez plus tard ou rafraîchissez</Text>
            <TouchableOpacity style={styles.refreshLargeButton} onPress={fetchDiscoverAnime}>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.refreshLargeText}>Actualiser</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {cards.slice(currentIndex, currentIndex + 2).reverse().map((card, i) => 
              renderCard(card, currentIndex + (1 - i))
            )}
          </>
        )}
      </View>

      {/* Action Buttons */}
      {hasMoreCards && !loading && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.nopeButton]}
            onPress={swipeLeft}
          >
            <Ionicons name="close" size={32} color="#ff6b6b" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.superLikeButton]}
            onPress={superLike}
            disabled={adding}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#00bcd4" />
            ) : (
              <Ionicons name="star" size={28} color="#00bcd4" />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.likeButton]}
            onPress={swipeRight}
            disabled={adding}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#4caf50" />
            ) : (
              <Ionicons name="heart" size={32} color="#4caf50" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions */}
      {hasMoreCards && !loading && (
        <View style={styles.instructionsContainer}>
          <View style={styles.instruction}>
            <Ionicons name="arrow-back" size={16} color="#ff6b6b" />
            <Text style={styles.instructionText}>Passer</Text>
          </View>
          <View style={styles.instruction}>
            <Ionicons name="arrow-up" size={16} color="#00bcd4" />
            <Text style={styles.instructionText}>Déjà vu</Text>
          </View>
          <View style={styles.instruction}>
            <Ionicons name="arrow-forward" size={16} color="#4caf50" />
            <Text style={styles.instructionText}>À voir</Text>
          </View>
        </View>
      )}

      {/* Counter */}
      {hasMoreCards && !loading && (
        <View style={styles.counterContainer}>
          <Text style={styles.counterText}>
            {currentIndex + 1} / {cards.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f0f0f',
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    position: 'absolute',
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.55,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  nextCard: {
    zIndex: -1,
  },
  cardImage: {
    width: '100%',
    height: '60%',
  },
  cardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(transparent 40%, rgba(0,0,0,0.9) 100%)',
  },
  likeLabel: {
    position: 'absolute',
    top: 40,
    left: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 3,
    borderColor: '#4caf50',
    borderRadius: 8,
    transform: [{ rotate: '-15deg' }],
  },
  likeLabelText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  nopeLabel: {
    position: 'absolute',
    top: 40,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 3,
    borderColor: '#ff6b6b',
    borderRadius: 8,
    transform: [{ rotate: '15deg' }],
  },
  nopeLabelText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff6b6b',
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: '600',
  },
  episodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  episodeText: {
    color: '#ccc',
    fontSize: 14,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  genreBadge: {
    backgroundColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreText: {
    color: '#aaa',
    fontSize: 12,
  },
  cardSynopsis: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 16,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  nopeButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#ff6b6b',
  },
  superLikeButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#00bcd4',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  likeButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#4caf50',
  },
  instructionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 8,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instructionText: {
    color: '#666',
    fontSize: 12,
  },
  counterContainer: {
    alignItems: 'center',
    paddingBottom: 30,
  },
  counterText: {
    color: '#666',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 12,
    padding: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  refreshLargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e63946',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
  },
  refreshLargeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
