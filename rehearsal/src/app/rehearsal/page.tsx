'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayback } from '../../lib/usePlayback';
import { fetchPlaylistsApi, fetchPlaylistApi, fetchMusicSearchApi } from '../../lib/useApi';
import {
  PlaybackStatus,
  PlaylistItemType,
  PresentationType,
  Playlist,
  PlaylistTrackSummary,
} from '../../lib/types';
import { SheetViewer } from '../../components/SheetViewer';
import { WaveformProgressBar } from '../../components/WaveformProgressBar';
import { initAudioContext, playMetronomeClick } from '../../lib/metronomeAudio';
import styles from './page.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getItemLabel(item: { type: string; music?: { title?: string; version?: string }; performer?: string; moderation_text?: { author?: string; text?: string } } | undefined): string {
  if (!item) return '';
  if (item.type === PlaylistItemType.TRACK) {
    const title = item.music?.title ?? '';
    return item.music?.version ? `${title} (${item.music.version})` : title;
  }
  if (item.type === PlaylistItemType.MODERATION_TEXT) {
    if (item.moderation_text?.text?.trim().toLowerCase() === 'pause') return 'Pause';
    return `Mod: ${item.performer ?? ''}`;
  }
  return '';
}

// ── BeatDots with optional sound ─────────────────────────────────────────────

function BeatDots({
  bpm, isActive, soundEnabled, timeSignature,
  startTime, countInStartTime, countInBeats, metronomeOffset,
}: {
  bpm: number; isActive: boolean; soundEnabled: boolean; timeSignature: string;
  startTime: number | null; countInStartTime: number | null;
  countInBeats: number; metronomeOffset: number;
}) {
  const beats = parseInt(timeSignature.split('/')[0], 10) || 4;
  const [activeBeat, setActiveBeat] = useState(-1);
  const rafRef = useRef<number | null>(null);
  const lastBeatRef = useRef(-1);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastBeatRef.current = -1;
    if (!isActive) { setActiveBeat(-1); return; }

    const interval = 60000 / bpm;
    const effectiveStart = startTime !== null ? startTime + metronomeOffset : null;

    const tick = () => {
      const now = Date.now();

      if (countInStartTime !== null && countInBeats > 0) {
        const ciElapsed = now - countInStartTime;
        if (ciElapsed >= 0 && ciElapsed < countInBeats * interval) {
          const ciBeat = Math.floor(ciElapsed / interval);
          if (ciBeat !== lastBeatRef.current) {
            lastBeatRef.current = ciBeat;
            setActiveBeat(-1);
            if (soundRef.current) {
              initAudioContext();
              playMetronomeClick('wood', ciBeat % beats === 0, 0.6, true, ciBeat % beats);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (effectiveStart === null) { rafRef.current = requestAnimationFrame(tick); return; }
      const elapsed = now - effectiveStart;
      if (elapsed < 0) { rafRef.current = requestAnimationFrame(tick); return; }

      const totalBeat = Math.floor(elapsed / interval);
      const beatInMeasure = totalBeat % beats;
      if (totalBeat !== lastBeatRef.current) {
        lastBeatRef.current = totalBeat;
        setActiveBeat(beatInMeasure);
        if (soundRef.current) {
          initAudioContext();
          playMetronomeClick('wood', beatInMeasure === 0, 0.5, false, beatInMeasure);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isActive, startTime, countInStartTime, countInBeats, bpm, beats, metronomeOffset]);

  return (
    <div className={styles.beatDots}>
      {Array.from({ length: beats }, (_, i) => (
        <div key={i} className={`${styles.beatDot} ${i === 0 ? styles.beatAccent : ''} ${i === activeBeat ? styles.beatActive : ''}`} />
      ))}
    </div>
  );
}

// ── Playlist picker overlay ───────────────────────────────────────────────────

function PlaylistPicker({
  playlists,
  loading,
  onPick,
  onPickSong,
}: {
  playlists: Playlist[];
  loading: boolean;
  onPick: (pl: Playlist) => void;
  onPickSong: (songs: PlaylistTrackSummary[], clickedUid: string) => void;
}) {
  const [tab, setTab] = useState<'playlists' | 'search'>('playlists');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaylistTrackSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      fetchMusicSearchApi(query)
        .then((r) => { setSearchResults(r); setSearching(false); })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className={styles.overlay}>
      <div className={styles.picker}>
        <div className={styles.pickerTitle}>Playlist auswählen</div>

        <div className={styles.pickerTabs}>
          <button
            className={`${styles.pickerTab} ${tab === 'playlists' ? styles.pickerTabActive : ''}`}
            onClick={() => setTab('playlists')}
          >
            Playlists
          </button>
          <button
            className={`${styles.pickerTab} ${tab === 'search' ? styles.pickerTabActive : ''}`}
            onClick={() => setTab('search')}
          >
            Song suchen
          </button>
        </div>

        {tab === 'playlists' && (
          <>
            {loading && <div className={styles.pickerEmpty}>Lade Playlists…</div>}
            {!loading && playlists.length === 0 && (
              <div className={styles.pickerEmpty}>Keine Playlists vorhanden</div>
            )}
            <div className={styles.pickerList}>
              {playlists.map((pl) => (
                <button key={pl.uid} className={styles.pickerItem} onClick={() => onPick(pl)}>
                  <span className={styles.pickerName}>{pl.name}</span>
                  {pl.description && <span className={styles.pickerDesc}>{pl.description}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Titel, Artist oder Genre…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {searching && <div className={styles.pickerEmpty}>Suche…</div>}
            {!searching && query.trim() && searchResults.length === 0 && (
              <div className={styles.pickerEmpty}>Keine Songs gefunden</div>
            )}
            <div className={styles.pickerList}>
              {searchResults.map((song) => (
                <button
                  key={song.uid}
                  className={styles.pickerItem}
                  onClick={() => onPickSong(searchResults, song.uid)}
                >
                  <span className={styles.pickerName}>{song.title}{song.version ? ` (${song.version})` : ''}</span>
                  <span className={styles.pickerDesc}>{song.author}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RehearsalPage() {
  const {
    isConnected,
    isLoading,
    playbackState,
    scheduledLocalStartTime,
    countInStartTime,
    connect,
    play,
    playTrack,
    pause,
    resume,
    stop,
    seek,
  } = usePlayback();

  const now = useClock();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [aCapellaStartTime, setACapellaStartTime] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Local playlist state — independent of server/FOH
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [availablePlaylists, setAvailablePlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  // Fetch playlist list whenever the picker is visible (initial load or manual open)
  const pickerVisible = !selectedPlaylist || showPicker;
  useEffect(() => {
    if (!pickerVisible) return;
    setLoadingPlaylists(true);
    fetchPlaylistsApi()
      .then((pls) => { setAvailablePlaylists(pls); setLoadingPlaylists(false); })
      .catch(() => setLoadingPlaylists(false));
  }, [pickerVisible]);

  // Fetch full playlist details on selection
  const handlePickPlaylist = useCallback((pl: Playlist) => {
    setShowPicker(false);
    fetchPlaylistApi(pl.uid)
      .then(setSelectedPlaylist)
      .catch(() => setSelectedPlaylist(pl));
  }, []);

  // Build virtual search playlist and play the clicked song
  const handlePickSong = useCallback((songs: PlaylistTrackSummary[], clickedUid: string) => {
    setShowPicker(false);
    const virtual: Playlist = {
      uid: '__search__',
      name: 'Suchergebnis',
      description: '',
      creation_timestamp: '',
      update_timestamp: '',
      items: songs.map((song, idx) => ({
        type: PlaylistItemType.TRACK,
        order: idx,
        music_uid: song.uid,
        music: song,
      })),
    };
    setSelectedPlaylist(virtual);
    playTrack(clickedUid, 0);
  }, [playTrack]);

  // Derive state from playback
  const {
    status,
    playlistUid: serverPlaylistUid,
    currentItemIndex: serverItemIndex = 0,
    currentTrackUid: serverTrackUid,
    metronomeOffset = 0,
    waveform,
    audioUrl,
    sheets = [],
    bpm,
    durationMs,
    timeSignature,
  } = playbackState;

  const isPlaying = status === PlaybackStatus.PLAYING;
  const isPaused = status === PlaybackStatus.PAUSED;
  const isCountIn = status === PlaybackStatus.COUNT_IN;
  const isPlaybackActive = isPlaying || isPaused || isCountIn || status === PlaybackStatus.LOADING;

  const isSearchPlaylist = selectedPlaylist?.uid === '__search__';

  // Active item index: server index for real playlists, track-uid match for search playlists
  const serverMatchesLocal = selectedPlaylist !== null && serverPlaylistUid === selectedPlaylist.uid;
  const localItems = selectedPlaylist?.items ?? [];
  const activeItemIndex = serverMatchesLocal
    ? serverItemIndex
    : (isSearchPlaylist && serverTrackUid
      ? localItems.findIndex((item) => item.music_uid === serverTrackUid)
      : -1);

  const currentLocalItem = localItems[activeItemIndex] ?? null;
  const localMusic = currentLocalItem?.type === PlaylistItemType.TRACK ? currentLocalItem.music : null;

  const isModeration = currentLocalItem?.type === PlaylistItemType.MODERATION_TEXT ||
    status === PlaybackStatus.MODERATION;

  const isACapella = !isModeration && localMusic?.presentation_type === PresentationType.A_CAPELLA;

  const effectiveBpm = bpm ?? localMusic?.bpm ?? 120;
  const effectiveDurationMs = durationMs ?? (localMusic?.duration ? localMusic.duration * 1000 : 0);
  const effectiveTimeSignature = timeSignature ?? localMusic?.time_signature ?? '4/4';
  const effectiveWaveform = isModeration ? null : (waveform ?? localMusic?.waveform ?? null);
  const effectiveAudioUrl = isModeration ? null : (audioUrl ?? localMusic?.file_url ?? null);
  const effectiveSheets = sheets.length > 0 ? sheets : (localMusic?.sheets ?? []);

  const displayModerationText = playbackState.currentModerationText ?? currentLocalItem?.moderation_text?.text;
  // A Capella: start visual metronome on track change
  useEffect(() => {
    if (!isACapella) { setACapellaStartTime(null); return; }
    setACapellaStartTime(Date.now());
  }, [activeItemIndex, isACapella]);

  const metronomeStartTime = isACapella ? aCapellaStartTime : scheduledLocalStartTime;
  const metronomeIsActive = isACapella ? aCapellaStartTime !== null : (isPlaying || isCountIn);

  // Track numbers (for sidebar display)
  // trackNumbers: continuous, absolute track index (1-based) used for seeking — must NOT reset.
  // displayNumbers: shown in the sidebar; counts all non-pause items and restarts after a pause.
  const trackNumbers = new Map<number, number>();
  const displayNumbers = new Map<number, number>();
  let trackN = 0;
  let displayN = 0;
  localItems.forEach((item, idx) => {
    const isPauseItem = item.type === PlaylistItemType.MODERATION_TEXT
      && item.moderation_text?.text?.trim().toLowerCase() === 'pause';
    if (isPauseItem) {
      displayN = 0; // restart visible numbering after a pause (pause row itself gets no number)
      return;
    }
    displayN += 1;
    displayNumbers.set(idx, displayN);
    if (item.type === PlaylistItemType.TRACK) trackNumbers.set(idx, ++trackN);
  });

  // For the play button: which track index should we (re)play?
  const currentTrackIdx = (() => {
    let count = 0;
    for (let i = 0; i < activeItemIndex; i++) {
      if (localItems[i]?.type === PlaylistItemType.TRACK) count++;
    }
    if (currentLocalItem?.type === PlaylistItemType.TRACK) return count;
    return Math.max(0, count - 1);
  })();

  const handleSidebarClick = useCallback((trackIdx: number) => {
    if (!selectedPlaylist) return;
    if (isSearchPlaylist) {
      let count = 0;
      for (const item of localItems) {
        if (item.type === PlaylistItemType.TRACK) {
          if (count === trackIdx && item.music_uid) { playTrack(item.music_uid, 0); return; }
          count++;
        }
      }
    } else {
      play(selectedPlaylist.uid, trackIdx, 0);
    }
  }, [selectedPlaylist, isSearchPlaylist, localItems, play, playTrack]);

  const handlePlayPause = useCallback(() => {
    if (!selectedPlaylist) return;
    if (isPaused) { resume(); return; }
    if (isPlaying || isCountIn) { pause(); return; }
    if (isSearchPlaylist) {
      const item = currentLocalItem ?? localItems.find((i) => i.type === PlaylistItemType.TRACK);
      if (item?.music_uid) playTrack(item.music_uid, 0);
      return;
    }
    if (!isModeration) play(selectedPlaylist.uid, Math.max(0, currentTrackIdx), 0);
  }, [selectedPlaylist, isPaused, isPlaying, isCountIn, isModeration, isSearchPlaylist,
      currentLocalItem, localItems, resume, pause, play, playTrack, currentTrackIdx]);

  // ── Loading screen ──────────────────────────────────────────────────────────

  if (!isConnected && isLoading) {
    return (
      <div className={styles.connecting}>
        <div className={styles.spinner} />
        Verbinde…
      </div>
    );
  }

  // ── Playlist picker ─────────────────────────────────────────────────────────

  if (!selectedPlaylist || showPicker) {
    return (
      <PlaylistPicker
        playlists={availablePlaylists}
        loading={loadingPlaylists}
        onPick={handlePickPlaylist}
        onPickSong={handlePickSong}
      />
    );
  }

  // ── Rehearsal UI ────────────────────────────────────────────────────────────

  return (
    <div className={`${styles.layout} ${sidebarOpen ? '' : styles.layoutCollapsed}`}>

      {/* ── Left sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          {sidebarOpen && (
            <span className={styles.sidebarTitle} title={selectedPlaylist.name}>
              {selectedPlaylist.name}
            </span>
          )}
          <div className={styles.sidebarHeaderBtns}>
            {sidebarOpen && (
              <button
                className={styles.changePlistBtn}
                onClick={() => setShowPicker(true)}
                title="Playlist wechseln"
              >
                ⇄
              </button>
            )}
            <button
              className={styles.collapseBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Einklappen' : 'Ausklappen'}
            >
              {sidebarOpen ? '‹' : '›'}
            </button>
          </div>
        </div>

        <div className={styles.sidebarList}>
          {localItems.map((item, idx) => {
            const isActive = idx === activeItemIndex;
            const trackNum = trackNumbers.get(idx);
            const displayNum = displayNumbers.get(idx);
            const isTrack = item.type === PlaylistItemType.TRACK;
            const isPause = item.type === PlaylistItemType.MODERATION_TEXT
              && item.moderation_text?.text?.trim().toLowerCase() === 'pause';
            return (
              <button
                key={idx}
                className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''} ${!isTrack ? styles.sidebarItemModeration : ''}`}
                onClick={() => isTrack ? handleSidebarClick(trackNum! - 1) : undefined}
                disabled={!isTrack}
              >
                <span className={styles.sidebarItemNum}>{isPause ? '☕' : displayNum}</span>
                <span className={styles.sidebarItemLabel}>{getItemLabel(item)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main: sheet music or moderation ── */}
      <main className={styles.main}>
        {isModeration ? (
          <div className={styles.moderationContent}>
            <div className={styles.moderationText}>{displayModerationText}</div>
          </div>
        ) : (
          <SheetViewer sheets={effectiveSheets} />
        )}
      </main>

      {/* ── Controls bar (hidden for A Capella) ── */}
      {!isACapella && (
        <div className={styles.controls}>
          <button
            className={`${styles.playPauseBtn} ${(isPlaying || isCountIn) ? styles.activePlay : ''}`}
            onClick={handlePlayPause}
            disabled={isModeration && !isPlaybackActive}
            title={isPaused ? 'Weiter' : (isPlaying || isCountIn) ? 'Pause' : 'Play'}
          >
            {(isPlaying || isCountIn) ? '⏸' : '▶'}
          </button>

          <WaveformProgressBar
            waveformData={effectiveWaveform}
            audioUrl={effectiveAudioUrl}
            durationMs={effectiveDurationMs}
            scheduledLocalStartTime={scheduledLocalStartTime}
            positionMs={playbackState.positionMs}
            isPlaying={isPlaying}
            onSeek={seek}
          />

          <button
            className={styles.stopBtn}
            onClick={stop}
            disabled={!isPlaybackActive}
            title="Stop"
          >
            ⏹
          </button>
        </div>
      )}

      {/* ── Footer: sound toggle + beat dots + BPM + clock ── */}
      <footer className={styles.footer}>
        <div className={styles.soundToggle}>
          <button
            className={`${styles.soundBtn} ${soundEnabled ? styles.soundBtnOn : ''}`}
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Metronom-Klick aus' : 'Metronom-Klick an'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <span className={styles.soundLabel}>{soundEnabled ? 'Klick an' : 'Klick aus'}</span>
        </div>

        <div className={styles.metronomeWrapper}>
          <BeatDots
            bpm={effectiveBpm}
            isActive={metronomeIsActive}
            soundEnabled={soundEnabled}
            timeSignature={effectiveTimeSignature}
            startTime={metronomeStartTime}
            countInStartTime={countInStartTime}
            countInBeats={playbackState.countInBeats ?? 0}
            metronomeOffset={isACapella ? 0 : metronomeOffset}
          />
        </div>

        <div className={styles.footerRight}>
          <div className={styles.bpm}>
            <span className={styles.bpmValue}>{effectiveBpm}</span>
            <span className={styles.bpmLabel}>BPM</span>
          </div>
          <span className={styles.clockTime} suppressHydrationWarning>{formatClock(now)}</span>
        </div>
      </footer>
    </div>
  );
}
