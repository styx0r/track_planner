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
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Autocomplete,
  createFilterOptions,
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
  GraphicEq,
  ExpandMore,
  ExpandLess,
  MicNone,
  Comment,
  MusicNote,
  PictureAsPdf,
  LocalCafe,
} from '@mui/icons-material';
import { exportPlaylistPdf } from '../../lib/exportPlaylistPdf';

type PlaylistItemType = 'TRACK' | 'MODERATION_TEXT';

interface MusicSummary {
  uid: string;
  title: string;
  author: string;
  version?: string;
  performer?: string;
  bpm?: number;
  duration?: number;
  time_signature?: string;
  key?: string;
  presentation_type?: 'A_CAPELLA' | 'LIVE_PIANO' | 'PLAYBACK';
  metronome_default_enabled?: boolean;
}

interface ModerationText {
  uid: string;
  author: string;
  creation_date: string;
  category: string;
  text: string;
}

interface PlaylistItemData {
  type: PlaylistItemType;
  order: number;
  performer?: string;
  // TRACK
  music_uid?: string;
  metronome_enabled_override?: boolean | null;
  music?: MusicSummary;
  // MODERATION_TEXT
  moderation_text_uid?: string;
  moderation_text?: { uid: string; text: string; author: string; category: string };
}

interface PlaylistItemFormItem extends PlaylistItemData {
  localId: string;
  expanded: boolean;
}

interface Playlist {
  uid: string;
  name: string;
  description?: string;
  items: PlaylistItemData[];
}

const PRESENTATION_LABELS: Record<string, string> = {
  A_CAPELLA: 'A Capella',
  LIVE_PIANO: 'Live-Piano',
  PLAYBACK: 'Playback',
};

// Search by title, version, performer, author AND presentation type — even though
// the dropdown displays the presentation type instead of the artist.
const musicSearchFilter = createFilterOptions<MusicSummary>({
  stringify: (s) =>
    `${s.title} ${s.version ?? ''} ${s.performer ?? ''} ${s.author ?? ''} ${s.presentation_type ? PRESENTATION_LABELS[s.presentation_type] : ''}`,
});

function isPauseModeration(item: { type: string; moderation_text?: { text?: string } }): boolean {
  return item.type === 'MODERATION_TEXT'
    && item.moderation_text?.text?.trim().toLowerCase() === 'pause';
}

// Running row numbers; a "Pause" moderation resets the count (null = no number on the pause row).
function computeRowNumbers(items: { type: string; moderation_text?: { text?: string } }[]): (number | null)[] {
  let n = 0;
  return items.map((item) => (isPauseModeration(item) ? ((n = 0), null) : ++n));
}

function formatTotalDuration(items: PlaylistItemData[]): string {
  const totalSeconds = items
    .filter((i) => i.type === 'TRACK')
    .reduce((sum, i) => sum + (i.music?.duration ?? 0), 0);
  if (totalSeconds === 0) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [music, setMusic] = useState<MusicSummary[]>([]);
  const [moderationTexts, setModerationTexts] = useState<ModerationText[]>([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [playlistForm, setPlaylistForm] = useState({ name: '', description: '' });
  const [playlistItems, setPlaylistItems] = useState<PlaylistItemFormItem[]>([]);
  const [trackToAdd, setTrackToAdd] = useState('');
  const [moderationToAdd, setModerationToAdd] = useState('');

  const handleExportPdf = useCallback(async (pl: { name: string; items: PlaylistItemData[] }) => {
    if (pl.items.length === 0) {
      setSnackbar({ open: true, message: 'Playlist ist leer – nichts zu exportieren.', severity: 'error' });
      return;
    }
    try {
      await exportPlaylistPdf(pl);
    } catch (error) {
      setSnackbar({ open: true, message: `PDF-Export fehlgeschlagen: ${error}`, severity: 'error' });
    }
  }, []);

  const togglePlaylistExpanded = useCallback((uid: string) => {
    setExpandedPlaylists((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }, []);

  const closePlaylistDialog = useCallback(() => {
    setPlaylistDialogOpen(false);
    setEditingPlaylist(null);
    setPlaylistForm({ name: '', description: '' });
    setPlaylistItems([]);
    setTrackToAdd('');
    setModerationToAdd('');
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
                items {
                  type
                  order
                  performer
                  music_uid
                  metronome_enabled_override
                  music { uid title author version performer bpm duration time_signature key presentation_type metronome_default_enabled }
                  moderation_text_uid
                  moderation_text { uid text author category }
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
                uid title author version performer bpm duration time_signature key presentation_type metronome_default_enabled
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

  const loadModerationTexts = useCallback(async () => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetModerationTexts {
              moderationTexts {
                uid author creation_date category text
              }
            }
          `,
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setModerationTexts(data.data.moderationTexts);
    } catch {
      // optional
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
    loadMusic();
    loadModerationTexts();
  }, [loadPlaylists, loadMusic, loadModerationTexts]);

  const handleCreatePlaylistClick = useCallback(() => {
    setEditingPlaylist(null);
    setPlaylistForm({ name: '', description: '' });
    setPlaylistItems([]);
    setTrackToAdd('');
    setModerationToAdd('');
    setPlaylistDialogOpen(true);
  }, []);

  const handleEditPlaylist = useCallback((playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setPlaylistForm({ name: playlist.name, description: playlist.description || '' });
    const sorted = [...playlist.items].sort((a, b) => a.order - b.order);
    setPlaylistItems(
      sorted.map((item, idx) => ({
        ...item,
        metronome_enabled_override: item.metronome_enabled_override ?? null,
        localId: `existing-${idx}-${item.music_uid ?? item.moderation_text_uid}`,
        expanded: false,
      }))
    );
    setTrackToAdd('');
    setModerationToAdd('');
    setPlaylistDialogOpen(true);
  }, []);

  const handleAddTrack = useCallback(() => {
    if (!trackToAdd) return;
    const musicItem = music.find((m) => m.uid === trackToAdd);
    setPlaylistItems((prev) => [
      ...prev,
      {
        type: 'TRACK',
        order: prev.length,
        music_uid: trackToAdd,
        music: musicItem,
        metronome_enabled_override: null,
        localId: `new-track-${trackToAdd}-${Date.now()}`,
        expanded: false,
      },
    ]);
    setTrackToAdd('');
  }, [trackToAdd, music]);

  const sortedMusic = useMemo(
    () => [...music].sort((a, b) => a.title.localeCompare(b.title, 'de')),
    [music],
  );

  const handleAddModerationText = useCallback(() => {
    if (!moderationToAdd) return;
    const mt = moderationTexts.find((m) => m.uid === moderationToAdd);
    setPlaylistItems((prev) => [
      ...prev,
      {
        type: 'MODERATION_TEXT',
        order: prev.length,
        moderation_text_uid: moderationToAdd,
        moderation_text: mt ? { uid: mt.uid, text: mt.text, author: mt.author, category: mt.category } : undefined,
        localId: `new-mod-${moderationToAdd}-${Date.now()}`,
        expanded: false,
      },
    ]);
    setModerationToAdd('');
  }, [moderationToAdd, moderationTexts]);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setPlaylistItems((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      return updated.map((item, idx) => ({ ...item, order: idx }));
    });
  }, []);

  const removeItem = useCallback((localId: string) => {
    setPlaylistItems((prev) =>
      prev
        .filter((i) => i.localId !== localId)
        .map((item, idx) => ({ ...item, order: idx }))
    );
  }, []);

  const updateItemField = useCallback(
    (localId: string, field: 'performer' | 'metronome_enabled_override', value: string | boolean | null) => {
      setPlaylistItems((prev) =>
        prev.map((i) => (i.localId === localId ? { ...i, [field]: value } : i))
      );
    },
    []
  );

  const toggleExpanded = useCallback((localId: string) => {
    setPlaylistItems((prev) =>
      prev.map((i) => (i.localId === localId ? { ...i, expanded: !i.expanded } : i))
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
      items: playlistItems.map((item, index) => ({
        type: item.type,
        order: index,
        performer: item.performer || undefined,
        music_uid: item.type === 'TRACK' ? item.music_uid : undefined,
        metronome_enabled_override:
          item.type === 'TRACK'
            ? (item.metronome_enabled_override === null ? undefined : item.metronome_enabled_override)
            : undefined,
        moderation_text_uid: item.type === 'MODERATION_TEXT' ? item.moderation_text_uid : undefined,
      })),
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
  }, [playlistForm, playlistItems, editingPlaylist, closePlaylistDialog, loadPlaylists]);

  const handleDeletePlaylist = useCallback(async (uid: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation DeletePlaylist($uid: String!) { deletePlaylist(uid: $uid) }`,
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
            No playlists yet. Click "New Playlist" to create one.
          </Typography>
        ) : (
          <List>
            {playlists.map((playlist, idx) => {
              const trackCount = playlist.items.filter((i) => i.type === 'TRACK').length;
              const modCount = playlist.items.filter((i) => i.type === 'MODERATION_TEXT').length;
              const totalDuration = formatTotalDuration(playlist.items);
              const isExpanded = expandedPlaylists.has(playlist.uid);
              return (
                <React.Fragment key={playlist.uid}>
                  {idx > 0 && <Divider sx={{ my: 1.5 }} />}
                  <ListItem disableGutters>
                    <IconButton
                      size="small"
                      onClick={() => togglePlaylistExpanded(playlist.uid)}
                      disabled={playlist.items.length === 0}
                      sx={{ mr: 1 }}
                    >
                      {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </IconButton>
                    <ListItemText
                      primary={playlist.name}
                      secondary={[
                        playlist.description,
                        trackCount > 0 ? `${trackCount} Song(s)` : null,
                        modCount > 0 ? `${modCount} Moderation(en)` : null,
                        totalDuration ? `Gesamt: ${totalDuration}` : null,
                      ].filter(Boolean).join(' • ')}
                    />
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Als PDF exportieren">
                        <IconButton size="small" onClick={() => handleExportPdf(playlist)}>
                          <PictureAsPdf fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" onClick={() => handleEditPlaylist(playlist)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeletePlaylist(playlist.uid)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItem>
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  {playlist.items.length > 0 && (
                    <Box sx={{ pl: 2 }}>
                      <List dense>
                        {(() => {
                          const sorted = [...playlist.items].sort((a, b) => a.order - b.order);
                          const nums = computeRowNumbers(sorted);
                          return sorted.map((item, i) => (
                            <ListItem
                              key={`${item.type}-${item.music_uid ?? item.moderation_text_uid}-${item.order}`}
                              disableGutters
                            >
                              {item.type === 'TRACK' ? (
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <MusicNote sx={{ fontSize: 14, color: 'text.secondary' }} />
                                      {`${nums[i]}. ${item.music?.title ?? 'Unknown track'}${item.music?.version ? ` (${item.music.version})` : ''}`}
                                    </Box>
                                  }
                                  secondary={[
                                    item.music?.presentation_type ? PRESENTATION_LABELS[item.music.presentation_type] : null,
                                    item.metronome_enabled_override !== undefined && item.metronome_enabled_override !== null
                                      ? `Metronom: ${item.metronome_enabled_override ? 'An' : 'Aus'}`
                                      : null,
                                  ].filter(Boolean).join(' • ')}
                                />
                              ) : isPauseModeration(item) ? (
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <LocalCafe sx={{ fontSize: 14, color: 'text.secondary' }} />
                                      Pause
                                    </Box>
                                  }
                                />
                              ) : (
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <Comment sx={{ fontSize: 14, color: 'text.secondary' }} />
                                      {`${nums[i]}. ${item.moderation_text?.text?.slice(0, 60) ?? 'Moderation text'}…`}
                                    </Box>
                                  }
                                  secondary={[
                                    item.performer,
                                    item.moderation_text?.author,
                                    item.moderation_text?.category,
                                  ].filter(Boolean).join(' · ')}
                                />
                              )}
                            </ListItem>
                          ));
                        })()}
                      </List>
                    </Box>
                  )}
                  </Collapse>
                </React.Fragment>
              );
            })}
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

          <Divider sx={{ my: 3 }} />

          {/* Unified items list */}
          <Typography variant="subtitle2" gutterBottom>
            Playlist-Inhalt
          </Typography>

          <List dense sx={{ mt: 1 }}>
            {playlistItems.length === 0 ? (
              <ListItem>
                <ListItemText
                  primary="Noch keine Einträge."
                  primaryTypographyProps={{ color: 'text.secondary' }}
                />
              </ListItem>
            ) : (
              (() => {
                const nums = computeRowNumbers(playlistItems);
                return playlistItems.map((item, index) => (
                <React.Fragment key={item.localId}>
                  <ListItem divider sx={{ pr: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <Box sx={{ mr: 1, mt: 0.5, color: 'text.secondary' }}>
                      {item.type === 'TRACK' ? (
                        <MusicNote fontSize="small" />
                      ) : isPauseModeration(item) ? (
                        <LocalCafe fontSize="small" />
                      ) : (
                        <Comment fontSize="small" />
                      )}
                    </Box>
                    <ListItemText
                      primary={
                        item.type === 'TRACK'
                          ? `${nums[index]}. ${item.music?.title ?? 'Unknown'}${item.music?.version ? ` (${item.music.version})` : ''}`
                          : isPauseModeration(item)
                          ? 'Pause'
                          : `${nums[index]}. ${item.moderation_text?.text?.slice(0, 60) ?? 'Moderation text'}…`
                      }
                      secondary={
                        item.type === 'TRACK'
                          ? (item.music?.presentation_type
                              ? PRESENTATION_LABELS[item.music.presentation_type]
                              : '')
                          : item.moderation_text?.author
                      }
                      sx={{ flexGrow: 1, minWidth: 0 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      <Tooltip title="Details">
                        <IconButton size="small" onClick={() => toggleExpanded(item.localId)}>
                          {item.expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={index === playlistItems.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removeItem(item.localId)}>
                        <RemoveCircle fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItem>
                  <Collapse in={item.expanded} timeout="auto" unmountOnExit>
                    <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', mb: 0.5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Performer"
                        placeholder={
                          item.type === 'TRACK'
                            ? `Standard: ${item.music?.performer || item.music?.author || 'Chor'}`
                            : 'Performer / Sprecher'
                        }
                        value={item.performer || ''}
                        onChange={(e) =>
                          updateItemField(item.localId, 'performer', e.target.value || '')
                        }
                        InputProps={{
                          startAdornment: <MicNone sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />,
                        }}
                        sx={{ mb: item.type === 'TRACK' ? 1.5 : 0 }}
                      />
                      {item.type === 'TRACK' && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            Metronom
                          </Typography>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={
                              item.metronome_enabled_override === null ||
                              item.metronome_enabled_override === undefined
                                ? 'inherit'
                                : item.metronome_enabled_override
                                ? 'on'
                                : 'off'
                            }
                            onChange={(_, val) => {
                              if (val === null) return;
                              updateItemField(
                                item.localId,
                                'metronome_enabled_override',
                                val === 'inherit' ? null : val === 'on'
                              );
                            }}
                          >
                            <ToggleButton value="inherit">
                              <Tooltip
                                title={`Aus Lied übernehmen (${(item.music?.metronome_default_enabled ?? true) ? 'An' : 'Aus'})`}
                              >
                                <span>Inherit</span>
                              </Tooltip>
                            </ToggleButton>
                            <ToggleButton value="on">
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <GraphicEq fontSize="small" /> An
                              </Box>
                            </ToggleButton>
                            <ToggleButton value="off">Aus</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      )}
                      {item.type === 'MODERATION_TEXT' && item.moderation_text && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          [{item.moderation_text.category}] {item.moderation_text.author}
                          {' — '}
                          {item.moderation_text.text.slice(0, 120)}
                          {item.moderation_text.text.length > 120 ? '…' : ''}
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </React.Fragment>
                ));
              })()
            )}
          </List>

          {/* Total duration */}
          {playlistItems.some((i) => i.type === 'TRACK') && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'right' }}>
              Gesamtlaufzeit: <strong>{formatTotalDuration(playlistItems)}</strong>
            </Typography>
          )}

          {/* Add track */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Autocomplete
              fullWidth
              size="small"
              options={sortedMusic}
              value={music.find((m) => m.uid === trackToAdd) ?? null}
              onChange={(_, val) => setTrackToAdd(val?.uid ?? '')}
              isOptionEqualToValue={(opt, val) => opt.uid === val.uid}
              filterOptions={musicSearchFilter}
              getOptionLabel={(song) =>
                `${song.title}${song.version ? ` (${song.version})` : ''} — ${song.presentation_type ? PRESENTATION_LABELS[song.presentation_type] : ''}`
              }
              renderInput={(params) => <TextField {...params} label="Song hinzufügen" />}
            />
            <Button
              variant="outlined"
              onClick={handleAddTrack}
              disabled={!trackToAdd}
              startIcon={<Add />}
            >
              Add
            </Button>
          </Box>

          {/* Add moderation text */}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Moderationstext hinzufügen</InputLabel>
              <Select
                value={moderationToAdd}
                label="Moderationstext hinzufügen"
                onChange={(e) => setModerationToAdd(e.target.value as string)}
              >
                {moderationTexts.map((mt) => (
                  <MenuItem key={mt.uid} value={mt.uid}>
                    [{mt.category}] {mt.author} — {mt.text.slice(0, 60)}{mt.text.length > 60 ? '…' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              onClick={handleAddModerationText}
              disabled={!moderationToAdd}
              startIcon={<Add />}
            >
              Add
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<PictureAsPdf />}
            onClick={() => handleExportPdf({ name: playlistForm.name, items: playlistItems })}
            disabled={playlistItems.length === 0}
          >
            PDF Export
          </Button>
          <Box sx={{ flex: 1 }} />
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
