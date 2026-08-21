'use client';

import { useState } from 'react';
import { Playlist, PlaylistTrackSummary } from './types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3333';
const GRAPHQL_URL = `${BACKEND_URL}/graphql`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const result: GraphQLResponse<T> = await response.json();
  
  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }
  
  if (!result.data) {
    throw new Error('No data returned from server');
  }
  
  return result.data;
}

const PLAYLIST_ITEMS_FRAGMENT = `
  items {
    type
    order
    performer
    music_uid
    metronome_enabled_override
    is_encore
    music {
      uid
      title
      author
      version
      presentation_type
      bpm
      duration
      waveform
      time_signature
      sheets {
        uid
        file_name
        original_name
        url
        order
        mime_type
        thumbnail_url
      }
    }
    moderation_text_uid
    moderation_text { uid text author category }
  }
`;

const PLAYLISTS_QUERY = `
  query GetPlaylists {
    playlists {
      uid
      name
      description
      creation_timestamp
      update_timestamp
      ${PLAYLIST_ITEMS_FRAGMENT}
    }
  }
`;

const PLAYLIST_QUERY = `
  query GetPlaylist($uid: String!) {
    playlist(uid: $uid) {
      uid
      name
      description
      creation_timestamp
      update_timestamp
      ${PLAYLIST_ITEMS_FRAGMENT}
    }
  }
`;

const MUSIC_SEARCH_QUERY = `
  query SearchMusic($title: String, $genre: String) {
    searchMusic(searchInput: { title: $title, genre: $genre }) {
      uid
      title
      author
      version
      presentation_type
      bpm
      duration
      waveform
      time_signature
      file_url
      sheets {
        uid
        file_name
        original_name
        url
        order
        mime_type
        thumbnail_url
      }
    }
  }
`;

const MUSIC_QUERY = `
  query GetMusicById($uid: String!) {
    getMusicById(uid: $uid) {
      uid
      title
      author
      version
      presentation_type
      bpm
      duration
      waveform
      time_signature
      file_url
      sheets {
        uid
        file_name
        original_name
        url
        order
        mime_type
        thumbnail_url
      }
    }
  }
`;

interface PlaylistsData {
  playlists: Playlist[];
}

interface PlaylistData {
  playlist: Playlist;
}

interface MusicData {
  getMusicById: PlaylistTrackSummary;
}

interface MusicSearchData {
  searchMusic: PlaylistTrackSummary[];
}

// Standalone fetch functions that don't cause re-renders
export async function fetchPlaylistsApi(): Promise<Playlist[]> {
  const data = await graphqlRequest<PlaylistsData>(PLAYLISTS_QUERY);
  return data.playlists;
}

export async function fetchPlaylistApi(uid: string): Promise<Playlist> {
  const data = await graphqlRequest<PlaylistData>(PLAYLIST_QUERY, { uid });
  return data.playlist;
}

export async function fetchMusicSearchApi(query: string): Promise<PlaylistTrackSummary[]> {
  if (!query.trim()) return [];
  const [byTitle, byGenre] = await Promise.all([
    graphqlRequest<MusicSearchData>(MUSIC_SEARCH_QUERY, { title: query }),
    graphqlRequest<MusicSearchData>(MUSIC_SEARCH_QUERY, { genre: query }),
  ]);
  const seen = new Set<string>();
  const merged: PlaylistTrackSummary[] = [];
  for (const song of [...byTitle.searchMusic, ...byGenre.searchMusic]) {
    if (!seen.has(song.uid)) {
      seen.add(song.uid);
      merged.push(song);
    }
  }
  return merged.sort((a, b) =>
    (a.title ?? '').localeCompare(b.title ?? '', 'de', { sensitivity: 'base' }),
  );
}

export async function fetchMusicApi(uid: string): Promise<PlaylistTrackSummary> {
  const data = await graphqlRequest<MusicData>(MUSIC_QUERY, { uid });
  return data.getMusicById;
}

// Hook for loading state (use sparingly to avoid re-render loops)
export function useApiState() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    isLoading,
    setIsLoading,
    error,
    setError,
  };
}
