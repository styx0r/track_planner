'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  Grid,
  Chip,
  IconButton,
  Fab,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Tooltip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  CloudUpload,
  Search,
  Edit,
  Delete,
  Add,
  PlayArrow,
  Pause,
  ArrowBack,
  ArrowUpward,
  ArrowDownward,
  OpenInNew,
  ContentCopy
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { parseBlob, type IAudioMetadata } from 'music-metadata-browser';

// Types
interface SheetMusic {
  uid: string;
  file_name: string;
  original_name: string;
  url: string;
  order: number;
  mime_type: string;
  thumbnail_name?: string;
  thumbnail_url?: string;
}

// Local sheet entry (before upload — may have a local File preview)
interface LocalSheet {
  uid: string;           // temporary local uid
  file?: File;           // present for pending (not yet uploaded) sheets
  previewUrl?: string;   // object URL for local image preview
  original_name: string;
  mime_type: string;
  order: number;
  // After upload these are populated:
  uploaded?: SheetMusic;
}

interface Music {
  uid: string;
  title: string;
  subtitle?: string;
  author: string;
  version?: string;
  presentation_type: PresentationType;
  genre?: string;
  bpm?: number;
  metronome_offset?: number;
  metronome_default_enabled?: boolean;
  time_signature?: string;
  key?: string;
  performer?: string;
  duration?: number;
  lyrics?: string;
  creation_timestamp: string;
  update_timestamp: string;
  file_url?: string;
  file_name?: string;
  sheets?: SheetMusic[];
}

interface MusicTableProps {
  rows: Music[];
  loading: boolean;
  currentlyPlaying: string | null;
  validGenreNames: Set<string>;
  onPlayPause: (uid: string, fileUrl: string) => void;
  onEdit: (row: Music) => void;
  onDeleteMusic: (uid: string) => void;
  onDuplicate: (uid: string) => void;
}

enum PresentationType {
  A_CAPELLA = 'A_CAPELLA',
  LIVE_PIANO = 'LIVE_PIANO',
  PLAYBACK = 'PLAYBACK',
}

const PRESENTATION_TYPE_LABELS: Record<PresentationType, string> = {
  [PresentationType.A_CAPELLA]: 'A Capella',
  [PresentationType.LIVE_PIANO]: 'Live Piano',
  [PresentationType.PLAYBACK]: 'Playback',
};

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '5/4', '7/8', '12/8'];

const KEYS = [
  'C-Dur', 'G-Dur', 'D-Dur', 'A-Dur', 'E-Dur', 'H-Dur', 'Fis-Dur',
  'Des-Dur', 'As-Dur', 'Es-Dur', 'B-Dur', 'F-Dur',
  'a-Moll', 'e-Moll', 'h-Moll', 'fis-Moll', 'cis-Moll', 'gis-Moll', 'dis-Moll',
  'b-Moll', 'f-Moll', 'c-Moll', 'g-Moll', 'd-Moll',
];

interface GenreOption {
  uid: string;
  name: string;
  order: number;
}

const GENRE_MANAGE_SENTINEL = '__manage_genres__';

const ACCEPTED_SHEET_TYPES = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/tif'];

const normalizeText = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const mapGenreFromMetadata = (
  value: string | null | undefined,
  genres: GenreOption[],
): string | undefined => {
  if (!value) return undefined;
  const normalized = normalizeText(value);
  return genres.find((genre) => normalizeText(genre.name) === normalized)?.name;
};

const fileNameWithoutExtension = (fileName: string) => fileName.replace(/\.[^/.]+$/, '').trim();

const pickArtist = (metadata: IAudioMetadata) =>
  metadata.common.artist || metadata.common.artists?.[0] || undefined;

interface CreateMusicInput {
  title: string;
  subtitle?: string;
  author: string;
  version?: string;
  presentation_type: PresentationType;
  genre?: string;
  bpm?: number;
  metronome_offset?: number;
  metronome_default_enabled?: boolean;
  time_signature?: string;
  key?: string;
  performer?: string;
  duration?: number;
  lyrics?: string;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface SearchFilters {
  title?: string;
  author?: string;
  genre?: string;
  presentation_type?: PresentationType;
}

interface EditMusicMetadata {
  uid: string;
  title: string;
  subtitle?: string;
  author: string;
  version?: string;
  presentation_type: PresentationType;
  genre?: string;
  bpm?: number;
  metronome_offset?: number;
  metronome_default_enabled?: boolean;
  time_signature?: string;
  key?: string;
  performer?: string;
  duration?: number;
}

// --- SheetMusicManager component ---

interface SheetMusicManagerProps {
  sheets: LocalSheet[];
  onChange: (sheets: LocalSheet[]) => void;
}

function SheetThumbnail({ sheet }: { sheet: LocalSheet }) {
  const previewUrl = sheet.previewUrl || sheet.uploaded?.thumbnail_url || sheet.uploaded?.url;

  if (previewUrl) {
    return (
      <CardMedia
        component="img"
        height={120}
        image={previewUrl}
        alt={sheet.original_name}
        sx={{ objectFit: 'contain', bgcolor: 'grey.50' }}
      />
    );
  }

  // Pending upload, no local preview yet (e.g. TIFF before upload)
  return (
    <Box
      sx={{
        width: '100%',
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
        borderRadius: 1
      }}
    >
      <CloudUpload sx={{ fontSize: 48, color: 'text.disabled' }} />
    </Box>
  );
}

const SheetMusicManager = memo(function SheetMusicManager({ sheets, onChange }: SheetMusicManagerProps) {
  const handleAddFiles = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const nextOrder = sheets.length > 0 ? Math.max(...sheets.map(s => s.order)) + 1 : 0;
    const newSheets: LocalSheet[] = files.map((file, idx) => {
      const isImage = IMAGE_MIME_TYPES.includes(file.type);
      return {
        uid: `local-${Date.now()}-${idx}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        original_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        order: nextOrder + idx,
      };
    });

    onChange([...sheets, ...newSheets]);
    // Reset input so the same file can be re-added if needed
    event.target.value = '';
  }, [sheets, onChange]);

  const handleRemove = useCallback((uid: string) => {
    const sheet = sheets.find(s => s.uid === uid);
    if (sheet?.previewUrl) URL.revokeObjectURL(sheet.previewUrl);
    const remaining = sheets
      .filter(s => s.uid !== uid)
      .map((s, idx) => ({ ...s, order: idx }));
    onChange(remaining);
  }, [sheets, onChange]);

  const handleMove = useCallback((uid: string, direction: 'up' | 'down') => {
    const idx = sheets.findIndex(s => s.uid === uid);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sheets.length - 1) return;

    const reordered = [...sheets];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    onChange(reordered.map((s, i) => ({ ...s, order: i })));
  }, [sheets, onChange]);

  const sorted = useMemo(() => [...sheets].sort((a, b) => a.order - b.order), [sheets]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Sheet Music ({sorted.length})
        </Typography>
        <Button
          component="label"
          size="small"
          variant="outlined"
          startIcon={<Add />}
        >
          Add Sheets
          <input
            type="file"
            hidden
            multiple
            accept={ACCEPTED_SHEET_TYPES}
            onChange={handleAddFiles}
          />
        </Button>
      </Box>

      {sorted.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'grey.50'
          }}
        >
          <CloudUpload sx={{ fontSize: 32, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.disabled">
            No sheets added. Supported: PDF, JPG, PNG, TIFF
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={1}>
          {sorted.map((sheet, idx) => (
            <Grid key={sheet.uid} size={{ xs: 6, sm: 4, md: 3 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <SheetThumbnail sheet={sheet} />
                <CardContent sx={{ py: 0.5, px: 1 }}>
                  <Tooltip title={sheet.original_name}>
                    <Typography
                      variant="caption"
                      noWrap
                      display="block"
                      sx={{ maxWidth: '100%' }}
                    >
                      {sheet.original_name}
                    </Typography>
                  </Tooltip>
                </CardContent>
                <CardActions sx={{ py: 0.5, px: 0.5, justifyContent: 'space-between' }}>
                  <Box>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleMove(sheet.uid, 'up')}
                          disabled={idx === 0}
                        >
                          <ArrowUpward fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleMove(sheet.uid, 'down')}
                          disabled={idx === sorted.length - 1}
                        >
                          <ArrowDownward fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  <Box>
                    {sheet.uploaded && (
                      <Tooltip title="Open in new tab">
                        <IconButton
                          size="small"
                          onClick={() => window.open(sheet.uploaded!.url, '_blank')}
                        >
                          <OpenInNew fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemove(sheet.uid)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
});

// Convert stored SheetMusic to LocalSheet
function toLocalSheet(sheet: SheetMusic): LocalSheet {
  return {
    uid: sheet.uid,
    original_name: sheet.original_name,
    mime_type: sheet.mime_type,
    order: sheet.order,
    previewUrl: sheet.thumbnail_url || (IMAGE_MIME_TYPES.includes(sheet.mime_type) ? sheet.url : undefined),
    uploaded: sheet,
  };
}

// --- MusicTable component ---

const MusicTable = memo(function MusicTable({
  rows,
  loading,
  currentlyPlaying,
  validGenreNames,
  onPlayPause,
  onEdit,
  onDeleteMusic,
  onDuplicate
}: MusicTableProps) {
  const columns = useMemo<GridColDef[]>(() => [
    {
      field: 'play',
      headerName: 'Play',
      width: 70,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          color="primary"
          onClick={() => onPlayPause(params.row.uid, params.row.file_url)}
          size="small"
          disabled={!params.row.file_url}
        >
          {currentlyPlaying === params.row.uid ? <Pause /> : <PlayArrow />}
        </IconButton>
      )
    },
    { field: 'title', headerName: 'Title', width: 200, editable: false },
    { field: 'subtitle', headerName: 'Subtitle', width: 150, editable: false },
    { field: 'author', headerName: 'Author', width: 150, editable: false },
    { field: 'version', headerName: 'Version', width: 100, editable: false },
    {
      field: 'genre',
      headerName: 'Genre',
      width: 120,
      renderCell: (params) => {
        const v = params.value as string | undefined;
        if (!v || !validGenreNames.has(v)) {
          return <Chip label="–" size="small" variant="outlined" />;
        }
        return <Chip label={v} size="small" color="primary" />;
      }
    },
    {
      field: 'presentation_type',
      headerName: 'Type',
      width: 100,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color="secondary" />
      )
    },
    { field: 'bpm', headerName: 'BPM', width: 80, type: 'number' },
    { field: 'metronome_offset', headerName: 'Offset (ms)', width: 100, type: 'number' },
    {
      field: 'duration',
      headerName: 'Duration',
      width: 90,
      sortable: true,
      renderCell: (params) => params.value ? formatDuration(params.value) : ''
    },
    {
      field: 'sheets',
      headerName: 'Sheets',
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const count = (params.value as SheetMusic[] | undefined)?.length ?? 0;
        return count > 0 ? (
          <Chip label={`${count} sheet${count > 1 ? 's' : ''}`} size="small" color="success" />
        ) : (
          <Chip label="None" size="small" variant="outlined" />
        );
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          key="duplicate"
          icon={<ContentCopy />}
          label="Duplicate"
          onClick={() => onDuplicate(params.row.uid)}
        />,
        <GridActionsCellItem
          key="edit"
          icon={<Edit />}
          label="Edit"
          onClick={() => onEdit(params.row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<Delete />}
          label="Delete"
          onClick={() => onDeleteMusic(params.row.uid)}
        />
      ]
    }
  ], [currentlyPlaying, validGenreNames, onPlayPause, onEdit, onDeleteMusic, onDuplicate]);

  return (
    <Paper sx={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.uid}
        loading={loading}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } }
        }}
        disableRowSelectionOnClick
      />
    </Paper>
  );
});

// --- Main page ---

export default function MusicManagement() {
  const [music, setMusic] = useState<Music[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [genreManagerOpen, setGenreManagerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null);
  const [editMetadata, setEditMetadata] = useState<EditMusicMetadata | null>(null);
  const [editLyrics, setEditLyrics] = useState('');
  const [editSheets, setEditSheets] = useState<LocalSheet[]>([]);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [genres, setGenres] = useState<GenreOption[]>([]);
  const validGenreNames = useMemo(() => new Set(genres.map((g) => g.name)), [genres]);

  // Audio player state
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Upload form state
  const [uploadForm, setUploadForm] = useState<CreateMusicInput>({
    title: '',
    author: '',
    performer: 'Chor',
    presentation_type: PresentationType.A_CAPELLA,
    time_signature: '4/4',
    key: '',
    metronome_default_enabled: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSheets, setUploadSheets] = useState<LocalSheet[]>([]);
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);

  const closeEditDialog = useCallback(() => {
    setEditDialogOpen(false);
    setSelectedMusic(null);
    setEditMetadata(null);
    setEditLyrics('');
    setEditSheets([]);
    setEditAudioFile(null);
  }, []);

  // Load music data
  const loadMusic = useCallback(async (filters: SearchFilters) => {
    setLoading(true);
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query SearchMusic($searchInput: MusicSearchInput) {
              searchMusic(searchInput: $searchInput) {
                uid
                title
                subtitle
                author
                version
                presentation_type
                genre
                bpm
                metronome_offset
                metronome_default_enabled
                time_signature
                key
                performer
                duration
                lyrics
                creation_timestamp
                update_timestamp
                file_url
                file_name
                sheets {
                  uid
                  file_name
                  original_name
                  url
                  order
                  mime_type
                  thumbnail_name
                  thumbnail_url
                }
              }
            }
          `,
          variables: { searchInput: filters }
        })
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      setMusic(data.data.searchMusic);
    } catch (error) {
      setSnackbar({ open: true, message: `Error loading music: ${error}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMusic({});
  }, [loadMusic]);

  const handleSearch = useCallback(() => {
    setAppliedFilters(searchFilters);
    loadMusic(searchFilters);
  }, [loadMusic, searchFilters]);

  const loadGenres = useCallback(async () => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { genres { uid name order } }`,
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setGenres(data.data.genres);
    } catch (error) {
      setSnackbar({ open: true, message: `Error loading genres: ${error}`, severity: 'error' });
    }
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  const createGenre = useCallback(async (name: string): Promise<GenreOption | null> => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation CreateGenre($input: CreateGenreInput!) { createGenre(input: $input) { uid name order } }`,
          variables: { input: { name } },
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      const created: GenreOption = data.data.createGenre;
      setGenres((prev) => [...prev, created].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
      return created;
    } catch (error) {
      setSnackbar({ open: true, message: `Create genre failed: ${error}`, severity: 'error' });
      return null;
    }
  }, []);

  const deleteGenre = useCallback(async (uid: string) => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation DeleteGenre($uid: ID!) { deleteGenre(uid: $uid) }`,
          variables: { uid },
        }),
      });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      setGenres((prev) => prev.filter((g) => g.uid !== uid));
    } catch (error) {
      setSnackbar({ open: true, message: `Delete genre failed: ${error}`, severity: 'error' });
    }
  }, []);

  const autoPopulateFromMetadata = useCallback(async (file: File) => {
    try {
      const metadata = await parseBlob(file);
      setUploadForm((prev) => {
        const updated = { ...prev };
        updated.presentation_type = PresentationType.PLAYBACK;
        const derivedTitle = metadata.common.title || fileNameWithoutExtension(file.name);
        if (!prev.title && derivedTitle) {
          updated.title = derivedTitle;
        }
        if (!prev.subtitle && metadata.common.album) {
          updated.subtitle = metadata.common.album;
        }
        const artist = pickArtist(metadata);
        if (!prev.author && artist) {
          updated.author = artist;
        }
        if (!prev.version && metadata.common.track?.no) {
          updated.version = metadata.common.track.no.toString();
        }
        if (!prev.genre) {
          const inferredGenre = mapGenreFromMetadata(metadata.common.genre?.[0], genres);
          if (inferredGenre) {
            updated.genre = inferredGenre;
          }
        }
        const bpm = metadata.common.bpm;
        if (!prev.bpm && typeof bpm === 'number' && !Number.isNaN(bpm)) {
          updated.bpm = Math.round(bpm);
        }
        const dur = metadata.format.duration;
        if (!prev.duration && typeof dur === 'number' && !Number.isNaN(dur)) {
          updated.duration = Math.round(dur);
        }
        return updated;
      });
    } catch (error) {
      console.warn('Audio metadata extraction failed', error);
    }
  }, [genres]);

  const handleAudioFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) {
      void autoPopulateFromMetadata(file);
    }
  }, [autoPopulateFromMetadata]);

  // Upload music
  const handleUpload = async () => {
    const formData = new FormData();
    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    // Append all pending sheet files in order
    const sorted = [...uploadSheets].sort((a, b) => a.order - b.order);
    for (const sheet of sorted) {
      if (sheet.file) {
        formData.append('sheetMusic', sheet.file);
      }
    }

    formData.append('operations', JSON.stringify({
      query: `
        mutation CreateMusic($createMusicInput: CreateMusicInput!) {
          createMusic(createMusicInput: $createMusicInput) {
            uid
            title
            author
          }
        }
      `,
      variables: { createMusicInput: uploadForm }
    }));

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      setSnackbar({ open: true, message: 'Music uploaded successfully!', severity: 'success' });
      setUploadDialogOpen(false);
      setUploadForm({
        title: '',
        author: '',
        performer: 'Chor',
        presentation_type: PresentationType.A_CAPELLA,
        time_signature: '4/4',
        key: '',
        metronome_default_enabled: true,
      });
      setSelectedFile(null);
      // Revoke any object URLs
      uploadSheets.forEach(s => { if (s.previewUrl) URL.revokeObjectURL(s.previewUrl); });
      setUploadSheets([]);
      await loadMusic(appliedFilters);
    } catch (error) {
      setSnackbar({ open: true, message: `Upload failed: ${error}`, severity: 'error' });
    }
  };

  // Update music metadata
  const handleUpdate = async () => {
    if (!editMetadata) return;

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation UpdateMusic($updateMusicInput: UpdateMusicInput!) {
              updateMusic(updateMusicInput: $updateMusicInput) {
                uid
                title
                author
              }
            }
          `,
          variables: {
            updateMusicInput: {
              uid: editMetadata.uid,
              title: editMetadata.title,
              subtitle: editMetadata.subtitle,
              author: editMetadata.author,
              version: editMetadata.version,
              presentation_type: editMetadata.presentation_type,
              genre: editMetadata.genre,
              bpm: editMetadata.bpm,
              metronome_offset: editMetadata.metronome_offset,
              metronome_default_enabled: editMetadata.metronome_default_enabled,
              time_signature: editMetadata.time_signature,
              key: editMetadata.key || undefined,
              performer: editMetadata.performer,
              duration: editMetadata.duration,
              lyrics: editLyrics || undefined
            }
          }
        })
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      // Now handle sheet changes: upload new sheets, delete removed ones, reorder
      const musicUid = editMetadata.uid;
      const originalSheets = selectedMusic?.sheets || [];

      // Determine deleted sheets
      const currentUploadedUids = new Set(
        editSheets
          .filter(s => s.uploaded && !s.uploaded.uid.startsWith('legacy-'))
          .map(s => s.uploaded!.uid)
      );
      const deletedSheets = originalSheets.filter(s => !currentUploadedUids.has(s.uid));
      for (const s of deletedSheets) {
        await fetch(`/api/music/${musicUid}/sheets/${s.uid}`, { method: 'DELETE' });
      }

      // Upload new sheets (those with file but no uploaded)
      const newSheets = editSheets.filter(s => s.file && !s.uploaded);
      if (newSheets.length > 0) {
        const sheetFormData = new FormData();
        const sorted = [...newSheets].sort((a, b) => a.order - b.order);
        for (const sheet of sorted) {
          sheetFormData.append('sheets', sheet.file!);
        }
        await fetch(`/api/music/${musicUid}/sheets`, {
          method: 'POST',
          body: sheetFormData
        });
      }

      // Reorder: send the final order of all uploaded sheets
      // Reload to get fresh uids after adds
      const freshResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query GetMusic($uid: String!) { getMusicById(uid: $uid) { sheets { uid order original_name } } }`,
          variables: { uid: musicUid }
        })
      });
      const freshData = await freshResponse.json();
      const freshSheets: SheetMusic[] = freshData?.data?.getMusicById?.sheets || [];

      // Build the desired order: match by original_name position in editSheets
      const sorted = [...editSheets].sort((a, b) => a.order - b.order);
      const orderedUids: string[] = sorted
        .map(ls => {
          if (ls.uploaded && !ls.uploaded.uid.startsWith('legacy-')) {
            return ls.uploaded.uid;
          }
          // Newly uploaded: find by original_name in fresh sheets
          const match = freshSheets.find(
            fs => fs.original_name === ls.original_name &&
              !sorted.some(other => other !== ls && other.uploaded?.uid === fs.uid)
          );
          return match?.uid;
        })
        .filter(Boolean) as string[];

      if (orderedUids.length > 1) {
        await fetch(`/api/music/${musicUid}/sheets/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedUids })
        });
      }

      // Replace audio file if a new one was selected
      if (editAudioFile) {
        const audioFormData = new FormData();
        audioFormData.append('file', editAudioFile);
        await fetch(`/api/music/${musicUid}/audio`, {
          method: 'PATCH',
          body: audioFormData
        });
      }

      setSnackbar({ open: true, message: 'Music updated successfully!', severity: 'success' });
      closeEditDialog();
      await loadMusic(appliedFilters);
    } catch (error) {
      setSnackbar({ open: true, message: `Update failed: ${error}`, severity: 'error' });
    }
  };

  // Duplicate music
  const handleDuplicate = useCallback(async (uid: string) => {
    try {
      const response = await fetch(`/api/music/${uid}/duplicate`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      setSnackbar({ open: true, message: 'Music duplicated successfully!', severity: 'success' });
      await loadMusic(appliedFilters);
    } catch (error) {
      setSnackbar({ open: true, message: `Duplicate failed: ${error}`, severity: 'error' });
    }
  }, [appliedFilters, loadMusic]);

  // Delete music
  const handleDeleteMusic = useCallback(async (uid: string) => {
    if (!confirm('Are you sure you want to delete this music?')) return;

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation DeleteMusic($uid: String!) {
              deleteMusic(uid: $uid)
            }
          `,
          variables: { uid }
        })
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      setSnackbar({ open: true, message: 'Music deleted successfully!', severity: 'success' });
      await loadMusic(appliedFilters);
    } catch (error) {
      setSnackbar({ open: true, message: `Delete failed: ${error}`, severity: 'error' });
    }
  }, [appliedFilters, loadMusic]);

  // Play/Pause audio
  const handlePlayPause = useCallback((uid: string, fileUrl: string) => {
    if (currentlyPlaying === uid) {
      audioElement?.pause();
      setCurrentlyPlaying(null);
      return;
    }

    audioElement?.pause();
    const audio = new Audio(fileUrl);
    audio.play();
    setAudioElement(audio);
    setCurrentlyPlaying(uid);

    audio.onended = () => {
      setCurrentlyPlaying(null);
    };
  }, [audioElement, currentlyPlaying]);

  const handleEditRow = useCallback((row: Music) => {
    setSelectedMusic(row);
    setEditMetadata({
      uid: row.uid,
      title: row.title,
      subtitle: row.subtitle,
      author: row.author,
      version: row.version,
      presentation_type: row.presentation_type,
      genre: row.genre && validGenreNames.has(row.genre) ? row.genre : undefined,
      bpm: row.bpm,
      metronome_offset: row.metronome_offset,
      metronome_default_enabled: row.metronome_default_enabled ?? true,
      time_signature: row.time_signature || '4/4',
      key: row.key || '',
      performer: row.performer || 'Chor',
      duration: row.duration
    });
    setEditLyrics(row.lyrics || '');
    setEditSheets((row.sheets || []).map(toLocalSheet));
    setEditDialogOpen(true);
  }, [validGenreNames]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          component={Link}
          href="/"
          variant="text"
          startIcon={<ArrowBack />}
        >
          Back
        </Button>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Music Management
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Upload, search, and manage your music library
          </Typography>
        </Box>
      </Box>

      {/* Search Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Search & Filter
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              label="Title"
              value={searchFilters.title || ''}
              onChange={(e) => setSearchFilters({ ...searchFilters, title: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              label="Author"
              value={searchFilters.author || ''}
              onChange={(e) => setSearchFilters({ ...searchFilters, author: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Genre</InputLabel>
              <Select
                value={searchFilters.genre || ''}
                label="Genre"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === GENRE_MANAGE_SENTINEL) {
                    setGenreManagerOpen(true);
                    return;
                  }
                  setSearchFilters({ ...searchFilters, genre: v || undefined });
                }}
              >
                <MenuItem value="">All</MenuItem>
                {genres.map((g) => (
                  <MenuItem key={g.uid} value={g.name}>{g.name}</MenuItem>
                ))}
                <MenuItem value={GENRE_MANAGE_SENTINEL} sx={{ fontStyle: 'italic', color: 'primary.main' }}>
                  + Genres verwalten
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={searchFilters.presentation_type || ''}
                label="Type"
                onChange={(e) => setSearchFilters({ ...searchFilters, presentation_type: e.target.value as PresentationType })}
              >
                <MenuItem value="">All</MenuItem>
                {Object.values(PresentationType).map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Search />}
              onClick={handleSearch}
            >
              Search
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Music Table */}
      <MusicTable
        rows={music}
        loading={loading}
        currentlyPlaying={currentlyPlaying}
        validGenreNames={validGenreNames}
        onPlayPause={handlePlayPause}
        onEdit={handleEditRow}
        onDeleteMusic={handleDeleteMusic}
        onDuplicate={handleDuplicate}
      />

      {/* Upload FAB */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setUploadDialogOpen(true)}
      >
        <Add />
      </Fab>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Upload New Music</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                startIcon={<CloudUpload />}
              >
                {selectedFile ? selectedFile.name : 'Select Audio File (optional)'}
                <input
                  type="file"
                  hidden
                  accept="audio/*"
                  onChange={handleAudioFileChange}
                />
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Title"
                required
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Subtitle"
                value={uploadForm.subtitle || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, subtitle: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Author"
                required
                value={uploadForm.author}
                onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Version"
                value={uploadForm.version || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Genre</InputLabel>
                <Select
                  value={uploadForm.genre || ''}
                  label="Genre"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === GENRE_MANAGE_SENTINEL) {
                      setGenreManagerOpen(true);
                      return;
                    }
                    setUploadForm({ ...uploadForm, genre: v || undefined });
                  }}
                >
                  <MenuItem value=""><em>–</em></MenuItem>
                  {genres.map((g) => (
                    <MenuItem key={g.uid} value={g.name}>{g.name}</MenuItem>
                  ))}
                  <MenuItem value={GENRE_MANAGE_SENTINEL} sx={{ fontStyle: 'italic', color: 'primary.main' }}>
                    + Genres verwalten
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Presentation Type</InputLabel>
                <Select
                  value={uploadForm.presentation_type}
                  label="Presentation Type"
                  onChange={(e) => setUploadForm({ ...uploadForm, presentation_type: e.target.value as PresentationType })}
                >
                  {Object.values(PresentationType).map((type) => (
                    <MenuItem key={type} value={type}>{PRESENTATION_TYPE_LABELS[type]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Performer"
                value={uploadForm.performer || ''}
                placeholder="Chor"
                onChange={(e) => setUploadForm({ ...uploadForm, performer: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Taktart</InputLabel>
                <Select
                  value={uploadForm.time_signature || '4/4'}
                  label="Taktart"
                  onChange={(e) => setUploadForm({ ...uploadForm, time_signature: e.target.value })}
                >
                  {TIME_SIGNATURES.map((ts) => (
                    <MenuItem key={ts} value={ts}>{ts}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tonart</InputLabel>
                <Select
                  value={uploadForm.key || ''}
                  label="Tonart"
                  onChange={(e) => setUploadForm({ ...uploadForm, key: e.target.value })}
                >
                  <MenuItem value=""><em>–</em></MenuItem>
                  {KEYS.map((k) => (
                    <MenuItem key={k} value={k}>{k}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="BPM"
                type="number"
                value={uploadForm.bpm || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, bpm: parseInt(e.target.value) || undefined })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Metronome Offset (ms)"
                type="number"
                value={uploadForm.metronome_offset || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, metronome_offset: parseInt(e.target.value) || undefined })}
                helperText="Offset in milliseconds relative to song start"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Duration (seconds)"
                type="number"
                value={uploadForm.duration || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, duration: parseInt(e.target.value) || undefined })}
                helperText={uploadForm.duration ? formatDuration(uploadForm.duration) : 'Auto-filled from audio file'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={uploadForm.metronome_default_enabled ?? true}
                    onChange={(e) => setUploadForm({ ...uploadForm, metronome_default_enabled: e.target.checked })}
                  />
                }
                label="Metronom standardmäßig aktiv"
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Lyrics (Liedtext)"
                multiline
                rows={4}
                value={uploadForm.lyrics || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, lyrics: e.target.value })}
                placeholder="Enter song lyrics here..."
              />
            </Grid>
            <Grid size={12}>
              <SheetMusicManager sheets={uploadSheets} onChange={setUploadSheets} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpload} variant="contained">Upload</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={closeEditDialog} maxWidth="md" fullWidth>
        <DialogTitle>Edit Music</DialogTitle>
        <DialogContent>
          {editMetadata && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Title"
                  required
                  value={editMetadata.title}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Subtitle"
                  value={editMetadata.subtitle || ''}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, subtitle: e.target.value } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Author"
                  required
                  value={editMetadata.author}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, author: e.target.value } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Version"
                  value={editMetadata.version || ''}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, version: e.target.value } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Genre</InputLabel>
                  <Select
                    value={editMetadata.genre || ''}
                    label="Genre"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === GENRE_MANAGE_SENTINEL) {
                        setGenreManagerOpen(true);
                        return;
                      }
                      setEditMetadata((prev) => prev ? { ...prev, genre: v || undefined } : prev);
                    }}
                  >
                    <MenuItem value=""><em>–</em></MenuItem>
                    {genres.map((g) => (
                      <MenuItem key={g.uid} value={g.name}>{g.name}</MenuItem>
                    ))}
                    <MenuItem value={GENRE_MANAGE_SENTINEL} sx={{ fontStyle: 'italic', color: 'primary.main' }}>
                      + Genres verwalten
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Presentation Type</InputLabel>
                  <Select
                    value={editMetadata.presentation_type}
                    label="Presentation Type"
                    onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, presentation_type: e.target.value as PresentationType } : prev)}
                  >
                    {Object.values(PresentationType).map((type) => (
                      <MenuItem key={type} value={type}>{PRESENTATION_TYPE_LABELS[type]}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Performer"
                  value={editMetadata.performer || ''}
                  placeholder="Chor"
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, performer: e.target.value } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Taktart</InputLabel>
                  <Select
                    value={editMetadata.time_signature || '4/4'}
                    label="Taktart"
                    onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, time_signature: e.target.value } : prev)}
                  >
                    {TIME_SIGNATURES.map((ts) => (
                      <MenuItem key={ts} value={ts}>{ts}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Tonart</InputLabel>
                  <Select
                    value={editMetadata.key || ''}
                    label="Tonart"
                    onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, key: e.target.value } : prev)}
                  >
                    <MenuItem value=""><em>–</em></MenuItem>
                    {KEYS.map((k) => (
                      <MenuItem key={k} value={k}>{k}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="BPM"
                  type="number"
                  value={editMetadata.bpm ?? ''}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, bpm: parseInt(e.target.value) || undefined } : prev)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Metronome Offset (ms)"
                  type="number"
                  value={editMetadata.metronome_offset ?? ''}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, metronome_offset: parseInt(e.target.value) || undefined } : prev)}
                  helperText="Offset in milliseconds relative to song start"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Duration (seconds)"
                  type="number"
                  value={editMetadata.duration ?? ''}
                  onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, duration: parseInt(e.target.value) || undefined } : prev)}
                  helperText={editMetadata.duration ? formatDuration(editMetadata.duration) : ''}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editMetadata.metronome_default_enabled ?? true}
                      onChange={(e) => setEditMetadata((prev) => prev ? { ...prev, metronome_default_enabled: e.target.checked } : prev)}
                    />
                  }
                  label="Metronom standardmäßig aktiv"
                />
              </Grid>
              <Grid size={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                    Audio file:
                  </Typography>
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, color: editAudioFile ? 'text.primary' : 'text.disabled' }}>
                    {editAudioFile ? editAudioFile.name : (selectedMusic?.file_name || 'No audio file')}
                  </Typography>
                  <Button
                    component="label"
                    size="small"
                    variant="outlined"
                    startIcon={<CloudUpload />}
                    sx={{ flexShrink: 0 }}
                  >
                    Replace
                    <input
                      type="file"
                      hidden
                      accept="audio/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setEditAudioFile(f);
                        if (f) {
                          parseBlob(f).then((meta) => {
                            const dur = meta.format.duration;
                            if (typeof dur === 'number' && !Number.isNaN(dur)) {
                              setEditMetadata((prev) => prev ? { ...prev, duration: Math.round(dur) } : prev);
                            }
                          }).catch(() => {});
                        }
                      }}
                    />
                  </Button>
                </Box>
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Lyrics (Liedtext)"
                  multiline
                  rows={4}
                  value={editLyrics}
                  onChange={(e) => setEditLyrics(e.target.value)}
                  placeholder="Enter song lyrics here..."
                />
              </Grid>
              <Grid size={12}>
                <SheetMusicManager sheets={editSheets} onChange={setEditSheets} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">Update</Button>
        </DialogActions>
      </Dialog>

      {/* Genre management dialog */}
      <GenreManagerDialog
        open={genreManagerOpen}
        onClose={() => setGenreManagerOpen(false)}
        genres={genres}
        onCreate={createGenre}
        onDelete={deleteGenre}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

interface GenreManagerDialogProps {
  open: boolean;
  onClose: () => void;
  genres: GenreOption[];
  onCreate: (name: string) => Promise<GenreOption | null>;
  onDelete: (uid: string) => Promise<void>;
}

function GenreManagerDialog({ open, onClose, genres, onCreate, onDelete }: GenreManagerDialogProps) {
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const created = await onCreate(trimmed);
    setSubmitting(false);
    if (created) setNewName('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Genres verwalten</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
          <TextField
            fullWidth
            size="small"
            label="Neues Genre"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreate}
            disabled={submitting || !newName.trim()}
          >
            Anlegen
          </Button>
        </Box>

        {genres.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            Noch keine Genres angelegt.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {genres.map((g) => (
              <Box
                key={g.uid}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="body2">{g.name}</Typography>
                <Tooltip title="Genre löschen">
                  <IconButton size="small" color="error" onClick={() => onDelete(g.uid)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
