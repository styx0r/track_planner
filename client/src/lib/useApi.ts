'use client';

import { useState } from 'react';
import { Playlist } from './types';

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

const PLAYLISTS_QUERY = `
  query GetPlaylists {
    playlists {
      uid
      name
      description
      creation_timestamp
      update_timestamp
      tracks {
        music_uid
        order
        music {
          uid
          title
          author
          sheet_music_url
          sheet_music_name
        }
      }
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
      tracks {
        music_uid
        order
        music {
          uid
          title
          author
          sheet_music_url
          sheet_music_name
        }
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

// Standalone fetch functions that don't cause re-renders
export async function fetchPlaylistsApi(): Promise<Playlist[]> {
  const data = await graphqlRequest<PlaylistsData>(PLAYLISTS_QUERY);
  return data.playlists;
}

export async function fetchPlaylistApi(uid: string): Promise<Playlist> {
  const data = await graphqlRequest<PlaylistData>(PLAYLIST_QUERY, { uid });
  return data.playlist;
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
