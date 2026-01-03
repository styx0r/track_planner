'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  Edit,
  Delete,
  ArrowUpward,
  ArrowDownward,
  RemoveCircle,
  QueueMusic,
} from '@mui/icons-material';

interface MusicSummary {
  uid: string;
  title: string;
  author: string;
}

interface PlaylistTrack {
  music_uid: string;
  order: number;
  music?: MusicSummary;
}

interface Playlist {
  uid: string;
  name: string;
  description?: string;
  tracks: PlaylistTrack[];
}

interface PlaylistTrackFormItem {
  musicUid: string;
  order: number;
  music?: MusicSummary;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [music, setMusic] = useState<MusicSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [playlistForm, setPlaylistForm] = useState({ name: '', description: '' });
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackFormItem[]>([]);
  const [trackToAdd, setTrackToAdd] = useState('');

  const closePlaylistDialog = useCallback(() => {
    setPlaylistDialogOpen(false);
    setEditingPlaylist(null);
    setPlaylistForm({ name: '', description: '' });
    setPlaylistTracks([]);
    setTrackToAdd('');
  }, []);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetPlaylists {
              playlists {
                uid
                name
                description
                tracks {
                  music_uid
                  order
                  music { uid title author }
                }
              }
            }
          `,
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setPlaylists(data.data.playlists);
    } catch (error) {
      setSnackbar({ open: true, message: `Error loading playlists: ${error}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMusic = useCallback(async () => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetMusic {
              searchMusic(searchInput: null) {
                uid
                title
                author
              }
            }
          `,
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setMusic(data.data.searchMusic);
    } catch (error) {
      setSnackbar({ open: true, message: `Error loading music list: ${error}`, severity: 'error' });
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
    loadMusic();
  }, [loadPlaylists, loadMusic]);

  const handleCreatePlaylistClick = useCallback(() => {
    setEditingPlaylist(null);
    setPlaylistForm({ name: '', description: '' });
    setPlaylistTracks([]);
    setTrackToAdd('');
    setPlaylistDialogOpen(true);
  }, []);

  const handleEditPlaylist = useCallback((playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setPlaylistForm({ name: playlist.name, description: playlist.description || '' });
    const sortedTracks = [...playlist.tracks].sort((a, b) => a.order - b.order);
    setPlaylistTracks(
      sortedTracks.map((track) => ({
        musicUid: track.music_uid,
        order: track.order,
        music: track.music,
      }))
    );
    setTrackToAdd('');
    setPlaylistDialogOpen(true);
  }, []);

  const handleAddTrackToPlaylist = useCallback(() => {
    if (!trackToAdd) return;
    const musicItem = music.find((item) => item.uid === trackToAdd);

    setPlaylistTracks((prev) => {
      if (prev.some((track) => track.musicUid === trackToAdd)) {
        setSnackbar({ open: true, message: 'Track already in playlist', severity: 'error' });
        return prev;
      }

      return [
        ...prev,
        {
          musicUid: trackToAdd,
          order: prev.length,
          music: musicItem,
        },
      ];
    });

    setTrackToAdd('');
  }, [trackToAdd, music]);

  const movePlaylistTrack = useCallback((index: number, direction: -1 | 1) => {
    setPlaylistTracks((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      return updated.map((track, idx) => ({ ...track, order: idx }));
    });
  }, []);

  const handleRemovePlaylistTrack = useCallback((musicUid: string) => {
    setPlaylistTracks((prev) =>
      prev
        .filter((track) => track.musicUid !== musicUid)
        .map((track, idx) => ({ ...track, order: idx }))
    );
  }, []);

  const handleSavePlaylist = useCallback(async () => {
    if (!playlistForm.name.trim()) {
      setSnackbar({ open: true, message: 'Playlist name is required', severity: 'error' });
      return;
    }

    const payload = {
      name: playlistForm.name.trim(),
      description: playlistForm.description.trim() || undefined,
      tracks: playlistTracks.map((track, index) => ({ music_uid: track.musicUid, order: index })),
    };

    const body = editingPlaylist
      ? {
          query: `
            mutation UpdatePlaylist($updatePlaylistInput: UpdatePlaylistInput!) {
              updatePlaylist(updatePlaylistInput: $updatePlaylistInput) { uid }
            }
          `,
          variables: { updatePlaylistInput: { uid: editingPlaylist.uid, ...payload } },
        }
      : {
          query: `
            mutation CreatePlaylist($createPlaylistInput: CreatePlaylistInput!) {
              createPlaylist(createPlaylistInput: $createPlaylistInput) { uid }
            }
          `,
          variables: { createPlaylistInput: payload },
        };

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);

      setSnackbar({
        open: true,
        message: editingPlaylist ? 'Playlist updated successfully!' : 'Playlist created successfully!',
        severity: 'success',
      });
      closePlaylistDialog();
      await loadPlaylists();
    } catch (error) {
      setSnackbar({ open: true, message: `Saving playlist failed: ${error}`, severity: 'error' });
    }
  }, [playlistForm, playlistTracks, editingPlaylist, closePlaylistDialog, loadPlaylists]);

  const handleDeletePlaylist = useCallback(async (uid: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation DeletePlaylist($uid: String!) {
              deletePlaylist(uid: $uid)
            }
          `,
          variables: { uid },
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setSnackbar({ open: true, message: 'Playlist deleted successfully!', severity: 'success' });
      await loadPlaylists();
    } catch (error) {
      setSnackbar({ open: true, message: `Delete playlist failed: ${error}`, severity: 'error' });
    }
  }, [loadPlaylists]);

  const availableTracks = useMemo(() => music, [music]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button component={Link} href="/" variant="text" startIcon={<ArrowBack />}>
          Back
        </Button>
        <Box sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QueueMusic color="primary" />
            <Typography variant="h4" component="h1">
              Playlists
            </Typography>
          </Box>
          <Typography variant="subtitle1" color="text.secondary">
            Create, edit, and reorder playlists based on your music library
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={handleCreatePlaylistClick}>
          New Playlist
        </Button>
      </Box>

      <Paper sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={36} />
          </Box>
        ) : playlists.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No playlists yet. Click “New Playlist” to create one.
          </Typography>
        ) : (
          <List>
            {playlists.map((playlist, idx) => (
              <React.Fragment key={playlist.uid}>
                {idx > 0 && <Divider sx={{ my: 1.5 }} />}
                <ListItem disableGutters>
                  <ListItemText
                    primary={playlist.name}
                    secondary={
                      playlist.description
                        ? `${playlist.description} • ${playlist.tracks.length} tracks`
                        : `${playlist.tracks.length} tracks`
                    }
                  />
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleEditPlaylist(playlist)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeletePlaylist(playlist.uid)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItem>
                {playlist.tracks.length > 0 && (
                  <Box sx={{ pl: 2 }}>
                    <List dense>
                      {[...playlist.tracks]
                        .sort((a, b) => a.order - b.order)
                        .map((track) => (
                          <ListItem key={track.music_uid} disableGutters>
                            <ListItemText
                              primary={`${track.order + 1}. ${track.music?.title ?? 'Unknown track'}`}
                              secondary={track.music?.author}
                            />
                          </ListItem>
                        ))}
                    </List>
                  </Box>
                )}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>

      <Dialog open={playlistDialogOpen} onClose={closePlaylistDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            required
            value={playlistForm.name}
            onChange={(e) => setPlaylistForm({ ...playlistForm, name: e.target.value })}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Description"
            multiline
            minRows={2}
            value={playlistForm.description}
            onChange={(e) => setPlaylistForm({ ...playlistForm, description: e.target.value })}
            sx={{ mt: 2 }}
          />

          <FormControl fullWidth sx={{ mt: 3 }}>
            <InputLabel>Add Track</InputLabel>
            <Select
              value={trackToAdd}
              label="Add Track"
              onChange={(e) => setTrackToAdd(e.target.value as string)}
            >
              {availableTracks.map((song) => (
                <MenuItem
                  key={song.uid}
                  value={song.uid}
                  disabled={playlistTracks.some((track) => track.musicUid === song.uid)}
                >
                  {song.title} — {song.author}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button sx={{ mt: 1 }} startIcon={<Add />} variant="outlined" onClick={handleAddTrackToPlaylist} disabled={!trackToAdd}>
            Add Track
          </Button>

          <List dense sx={{ mt: 2 }}>
            {playlistTracks.length === 0 ? (
              <ListItem>
                <ListItemText primary="No tracks selected yet." primaryTypographyProps={{ color: 'text.secondary' }} />
              </ListItem>
            ) : (
              playlistTracks.map((track, index) => (
                <ListItem
                  key={track.musicUid}
                  divider
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton size="small" disabled={index === 0} onClick={() => movePlaylistTrack(index, -1)}>
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={index === playlistTracks.length - 1}
                        onClick={() => movePlaylistTrack(index, 1)}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleRemovePlaylistTrack(track.musicUid)}>
                        <RemoveCircle fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={`${index + 1}. ${track.music?.title ?? 'Unknown track'}`}
                    secondary={track.music?.author}
                  />
                </ListItem>
              ))
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePlaylistDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePlaylist}>
            {editingPlaylist ? 'Save Changes' : 'Create Playlist'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}





