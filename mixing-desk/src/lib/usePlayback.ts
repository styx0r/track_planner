'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  PlaybackState,
  MetronomeState,
  PlaybackStatus,
  WS_EVENTS,
} from './types';
import { performTimeSync, TimeSyncResult, getLocalStartTime } from './timeSync';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3333';

interface UsePlaybackReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  syncResult: TimeSyncResult | null;
  isSyncing: boolean;
  playbackState: PlaybackState;
  metronomeState: MetronomeState;
  scheduledLocalStartTime: number | null;
  countInStartTime: number | null;
  performanceStartTime: number | null;
  connect: () => void;
  disconnect: () => void;
  resync: () => Promise<void>;
  play: (playlistUid: string, trackIndex?: number, countInBeats?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (positionMs: number) => void;
  toggleMetronome: (enabled?: boolean) => void;
  setMetronomeBpm: (bpm: number) => void;
  setCountIn: (beats: number) => void;
  startPerformance: () => void;
  loadPlaylist: (playlistUid: string) => void;
}

export function usePlayback(): UsePlaybackReturn {
  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncResult, setSyncResult] = useState<TimeSyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    status: PlaybackStatus.IDLE,
  });

  const [metronomeState, setMetronomeState] = useState<MetronomeState>({
    enabled: false,
    bpm: 120,
  });

  const [scheduledLocalStartTime, setScheduledLocalStartTime] = useState<number | null>(null);
  const [countInStartTime, setCountInStartTime] = useState<number | null>(null);
  const [performanceStartTime, setPerformanceStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (syncResult) {
      if (playbackState.scheduledStartTime) {
        setScheduledLocalStartTime(getLocalStartTime(playbackState.scheduledStartTime, syncResult.offset));
      } else {
        setScheduledLocalStartTime(null);
      }
      if (playbackState.countInStartTime) {
        setCountInStartTime(getLocalStartTime(playbackState.countInStartTime, syncResult.offset));
      } else {
        setCountInStartTime(null);
      }
    } else {
      setScheduledLocalStartTime(null);
      setCountInStartTime(null);
    }
  }, [playbackState.scheduledStartTime, playbackState.countInStartTime, syncResult]);

  const performSync = useCallback(async (socket: Socket) => {
    setIsSyncing(true);
    try {
      const result = await performTimeSync(socket, 15, 100);
      setSyncResult(result);
    } catch {
      setError('Failed to synchronize time with server');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    setIsLoading(true);
    setError(null);

    const socket = io(`${BACKEND_URL}/playback`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setIsLoading(false);
      socket.emit(WS_EVENTS.GET_STATE);
      performSync(socket);
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('connect_error', (err) => {
      setError(`Failed to connect: ${err.message}`);
      setIsLoading(false);
    });

    socket.on(WS_EVENTS.PLAYBACK_STATE, (state: PlaybackState) => setPlaybackState(state));
    socket.on(WS_EVENTS.PLAYBACK_STARTED, (state: PlaybackState) => setPlaybackState(state));
    socket.on(WS_EVENTS.PLAYBACK_PAUSED, (state: PlaybackState) => setPlaybackState(state));
    socket.on(WS_EVENTS.PLAYBACK_STOPPED, (state: PlaybackState) => {
      setPlaybackState(state);
      setCountInStartTime(null);
      setScheduledLocalStartTime(null);
    });
    socket.on(WS_EVENTS.PLAYBACK_TRACK_CHANGED, (state: PlaybackState) => setPlaybackState(state));
    socket.on(WS_EVENTS.PLAYBACK_ERROR, (data: { message: string }) => setError(data.message));
    socket.on(WS_EVENTS.METRONOME_STATE, (state: MetronomeState) => setMetronomeState(state));
    socket.on(WS_EVENTS.PERFORMANCE_STARTED, (data: { performanceStartTime: number }) => {
      setPerformanceStartTime(data.performanceStartTime);
      setPlaybackState((state) => ({
        ...state,
        performanceStartTime: data.performanceStartTime,
      }));
    });
  }, [performSync]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setIsConnected(false);
  }, []);

  const resync = useCallback(async () => {
    if (socketRef.current?.connected) await performSync(socketRef.current);
  }, [performSync]);

  const play = useCallback((playlistUid: string, trackIndex = 0, countInBeats = 0) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.PLAY, { playlistUid, trackIndex, countInBeats });
  }, []);

  const pause = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.PAUSE);
  }, []);

  const resume = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.RESUME);
  }, []);

  const stop = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.STOP);
  }, []);

  const next = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.NEXT);
  }, []);

  const previous = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.PREVIOUS);
  }, []);

  const seek = useCallback((positionMs: number) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.SEEK, { positionMs });
  }, []);

  const toggleMetronome = useCallback((enabled?: boolean) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.METRONOME_TOGGLE, { enabled });
  }, []);

  const setMetronomeBpm = useCallback((bpm: number) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.METRONOME_SET_BPM, { bpm });
  }, []);

  const setCountIn = useCallback((beats: number) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.METRONOME_SET_COUNT_IN, { beats });
  }, []);

  const startPerformance = useCallback(() => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.START_PERFORMANCE);
  }, []);

  const loadPlaylist = useCallback((playlistUid: string) => {
    socketRef.current?.connected && socketRef.current.emit(WS_EVENTS.LOAD_PLAYLIST, { playlistUid });
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    isConnected,
    isLoading,
    error,
    syncResult,
    isSyncing,
    playbackState,
    metronomeState,
    scheduledLocalStartTime,
    countInStartTime,
    performanceStartTime,
    connect,
    disconnect,
    resync,
    play,
    pause,
    resume,
    seek,
    stop,
    next,
    previous,
    toggleMetronome,
    setMetronomeBpm,
    setCountIn,
    startPerformance,
    loadPlaylist,
  };
}
