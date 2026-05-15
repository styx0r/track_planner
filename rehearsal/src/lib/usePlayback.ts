'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  PlaybackState, 
  MetronomeState, 
  PlaybackStatus,
  WS_EVENTS 
} from './types';
import { performTimeSync, TimeSyncResult, getLocalStartTime } from './timeSync';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3333';

interface UsePlaybackReturn {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Sync state
  syncResult: TimeSyncResult | null;
  isSyncing: boolean;
  
  // Playback state
  playbackState: PlaybackState;
  metronomeState: MetronomeState;
  
  // Derived state for metronome
  scheduledLocalStartTime: number | null;
  countInStartTime: number | null; // When count-in starts (local time)
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  resync: () => Promise<void>;
  loadPlaylist: (playlistUid: string) => void;
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

  // Calculate local start times when scheduled time or sync changes
  useEffect(() => {
    if (syncResult) {
      if (playbackState.scheduledStartTime) {
        const localTime = getLocalStartTime(playbackState.scheduledStartTime, syncResult.offset);
        setScheduledLocalStartTime(localTime);
      } else {
        setScheduledLocalStartTime(null);
      }
      
      if (playbackState.countInStartTime) {
        const localCountIn = getLocalStartTime(playbackState.countInStartTime, syncResult.offset);
        setCountInStartTime(localCountIn);
      } else {
        setCountInStartTime(null);
      }
    } else {
      setScheduledLocalStartTime(null);
      setCountInStartTime(null);
    }
  }, [playbackState.scheduledStartTime, playbackState.countInStartTime, syncResult]);

  // Perform time sync
  const performSync = useCallback(async (socket: Socket) => {
    setIsSyncing(true);
    try {
      const result = await performTimeSync(socket, 15, 100);
      setSyncResult(result);
      console.log('Time sync complete:', result);
    } catch (err) {
      console.error('Time sync failed:', err);
      setError('Failed to synchronize time with server');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Connect to WebSocket
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
      console.log('Connected to playback server');
      setIsConnected(true);
      setIsLoading(false);
      
      // Request current state
      socket.emit(WS_EVENTS.GET_STATE);
      
      // Perform time sync
      performSync(socket);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from playback server');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError(`Failed to connect: ${err.message}`);
      setIsLoading(false);
    });

    // Playback state handlers
    socket.on(WS_EVENTS.PLAYBACK_STATE, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    socket.on(WS_EVENTS.PLAYBACK_STARTED, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    socket.on(WS_EVENTS.PLAYBACK_PAUSED, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    socket.on(WS_EVENTS.PLAYBACK_STOPPED, (state: PlaybackState) => {
      setPlaybackState(state);
      setCountInStartTime(null);
      setScheduledLocalStartTime(null);
    });

    socket.on(WS_EVENTS.PLAYBACK_TRACK_CHANGED, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    socket.on(WS_EVENTS.PLAYBACK_ERROR, (data: { message: string }) => {
      setError(data.message);
    });

    // Metronome state handler
    socket.on(WS_EVENTS.METRONOME_STATE, (state: MetronomeState) => {
      setMetronomeState(state);
    });
  }, [performSync]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Re-sync time
  const resync = useCallback(async () => {
    if (socketRef.current?.connected) {
      await performSync(socketRef.current);
    }
  }, [performSync]);

  // Playback controls
  const loadPlaylist = useCallback((playlistUid: string) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.LOAD_PLAYLIST, { playlistUid });
  }, []);

  const play = useCallback((playlistUid: string, trackIndex: number = 0, countInBeats: number = 0) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.PLAY, { playlistUid, trackIndex, countInBeats });
  }, []);

  const pause = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.PAUSE);
  }, []);

  const resume = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.RESUME);
  }, []);

  const stop = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.STOP);
  }, []);

  const next = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.NEXT);
  }, []);

  const previous = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.PREVIOUS);
  }, []);

  const toggleMetronome = useCallback((enabled?: boolean) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.METRONOME_TOGGLE, { enabled });
  }, []);

  const setMetronomeBpm = useCallback((bpm: number) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.METRONOME_SET_BPM, { bpm });
  }, []);

  const seek = useCallback((positionMs: number) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(WS_EVENTS.SEEK, { positionMs });
  }, []);

  const setCountIn = useCallback((beats: number) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('metronome:setCountIn', { beats });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
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
    connect,
    disconnect,
    resync,
    loadPlaylist,
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
  };
}
