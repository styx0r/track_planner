'use client';

import React, { useState, useEffect } from 'react';
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
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Fab
} from '@mui/material';
import {
  CloudUpload,
  Search,
  Edit,
  Delete,
  Add,
  PlayArrow,
  Pause,
  MusicNote
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';

// Types
interface Music {
  uid: string;
  title: string;
  subtitle?: string;
  author: string;
  version?: string;
  presentation_type: PresentationType;
  genre: Genre;
  bpm?: number;
  creation_timestamp: string;
  update_timestamp: string;
  file_url: string;
  file_name: string;
}

enum PresentationType {
  LIVE = 'LIVE',
  STUDIO = 'STUDIO',
  REMIX = 'REMIX',
  ACOUSTIC = 'ACOUSTIC'
}

enum Genre {
  ROCK = 'ROCK',
  POP = 'POP',
  JAZZ = 'JAZZ',
  CLASSICAL = 'CLASSICAL',
  ELECTRONIC = 'ELECTRONIC',
  HIP_HOP = 'HIP_HOP',
  COUNTRY = 'COUNTRY',
  BLUES = 'BLUES',
  FOLK = 'FOLK',
  OTHER = 'OTHER'
}

interface CreateMusicInput {
  title: string;
  subtitle?: string;
  author: string;
  version?: string;
  presentation_type: PresentationType;
  genre: Genre;
  bpm?: number;
}

interface SearchFilters {
  title?: string;
  author?: string;
  genre?: Genre;
  presentation_type?: PresentationType;
}

export default function MusicManagement() {
  const [music, setMusic] = useState<Music[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Form states
  const [uploadForm, setUploadForm] = useState<CreateMusicInput>({
    title: '',
    author: '',
    presentation_type: PresentationType.STUDIO,
    genre: Genre.OTHER
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Load music data
  const loadMusic = async () => {
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
                creation_timestamp
                update_timestamp
                file_url
                file_name
              }
            }
          `,
          variables: { searchInput: searchFilters }
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
  };

  useEffect(() => {
    loadMusic();
  }, [searchFilters]);

  // Upload music
  const handleUpload = async () => {
    if (!selectedFile) {
      setSnackbar({ open: true, message: 'Please select a file', severity: 'error' });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
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
        presentation_type: PresentationType.STUDIO,
        genre: Genre.OTHER
      });
      setSelectedFile(null);
      loadMusic();
    } catch (error) {
      setSnackbar({ open: true, message: `Upload failed: ${error}`, severity: 'error' });
    }
  };

  // Update music
  const handleUpdate = async () => {
    if (!selectedMusic) return;

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
              uid: selectedMusic.uid,
              title: selectedMusic.title,
              subtitle: selectedMusic.subtitle,
              author: selectedMusic.author,
              version: selectedMusic.version,
              presentation_type: selectedMusic.presentation_type,
              genre: selectedMusic.genre,
              bpm: selectedMusic.bpm
            }
          }
        })
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      setSnackbar({ open: true, message: 'Music updated successfully!', severity: 'success' });
      setEditDialogOpen(false);
      setSelectedMusic(null);
      loadMusic();
    } catch (error) {
      setSnackbar({ open: true, message: `Update failed: ${error}`, severity: 'error' });
    }
  };

  // Delete music
  const handleDelete = async (uid: string) => {
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
      loadMusic();
    } catch (error) {
      setSnackbar({ open: true, message: `Delete failed: ${error}`, severity: 'error' });
    }
  };

  // DataGrid columns
  const columns: GridColDef[] = [
    { field: 'title', headerName: 'Title', width: 200, editable: false },
    { field: 'subtitle', headerName: 'Subtitle', width: 150, editable: false },
    { field: 'author', headerName: 'Author', width: 150, editable: false },
    { field: 'version', headerName: 'Version', width: 100, editable: false },
    { 
      field: 'genre', 
      headerName: 'Genre', 
      width: 120,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color="primary" />
      )
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
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          key="edit"
          icon={<Edit />}
          label="Edit"
          onClick={() => {
            setSelectedMusic(params.row);
            setEditDialogOpen(true);
          }}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<Delete />}
          label="Delete"
          onClick={() => handleDelete(params.row.uid)}
        />
      ]
    }
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Music Management
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Upload, search, and manage your music library
        </Typography>
      </Box>

      {/* Search Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Search & Filter
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Title"
              value={searchFilters.title || ''}
              onChange={(e) => setSearchFilters({ ...searchFilters, title: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Author"
              value={searchFilters.author || ''}
              onChange={(e) => setSearchFilters({ ...searchFilters, author: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
              <InputLabel>Genre</InputLabel>
              <Select
                value={searchFilters.genre || ''}
                label="Genre"
                onChange={(e) => setSearchFilters({ ...searchFilters, genre: e.target.value as Genre })}
              >
                <MenuItem value="">All</MenuItem>
                {Object.values(Genre).map((genre) => (
                  <MenuItem key={genre} value={genre}>{genre}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
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
          <Grid item xs={12} sm={2}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Search />}
              onClick={loadMusic}
            >
              Search
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Music Table */}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={music}
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
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload New Music</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                startIcon={<CloudUpload />}
                sx={{ mb: 2 }}
              >
                {selectedFile ? selectedFile.name : 'Select Audio File'}
                <input
                  type="file"
                  hidden
                  accept="audio/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Title"
                required
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Subtitle"
                value={uploadForm.subtitle || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, subtitle: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Author"
                required
                value={uploadForm.author}
                onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Version"
                value={uploadForm.version || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Genre</InputLabel>
                <Select
                  value={uploadForm.genre}
                  label="Genre"
                  onChange={(e) => setUploadForm({ ...uploadForm, genre: e.target.value as Genre })}
                >
                  {Object.values(Genre).map((genre) => (
                    <MenuItem key={genre} value={genre}>{genre}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Presentation Type</InputLabel>
                <Select
                  value={uploadForm.presentation_type}
                  label="Presentation Type"
                  onChange={(e) => setUploadForm({ ...uploadForm, presentation_type: e.target.value as PresentationType })}
                >
                  {Object.values(PresentationType).map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="BPM"
                type="number"
                value={uploadForm.bpm || ''}
                onChange={(e) => setUploadForm({ ...uploadForm, bpm: parseInt(e.target.value) || undefined })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpload} variant="contained">Upload</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Music</DialogTitle>
        <DialogContent>
          {selectedMusic && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Title"
                  required
                  value={selectedMusic.title}
                  onChange={(e) => setSelectedMusic({ ...selectedMusic, title: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Subtitle"
                  value={selectedMusic.subtitle || ''}
                  onChange={(e) => setSelectedMusic({ ...selectedMusic, subtitle: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Author"
                  required
                  value={selectedMusic.author}
                  onChange={(e) => setSelectedMusic({ ...selectedMusic, author: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Version"
                  value={selectedMusic.version || ''}
                  onChange={(e) => setSelectedMusic({ ...selectedMusic, version: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Genre</InputLabel>
                  <Select
                    value={selectedMusic.genre}
                    label="Genre"
                    onChange={(e) => setSelectedMusic({ ...selectedMusic, genre: e.target.value as Genre })}
                  >
                    {Object.values(Genre).map((genre) => (
                      <MenuItem key={genre} value={genre}>{genre}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Presentation Type</InputLabel>
                  <Select
                    value={selectedMusic.presentation_type}
                    label="Presentation Type"
                    onChange={(e) => setSelectedMusic({ ...selectedMusic, presentation_type: e.target.value as PresentationType })}
                  >
                    {Object.values(PresentationType).map((type) => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="BPM"
                  type="number"
                  value={selectedMusic.bpm || ''}
                  onChange={(e) => setSelectedMusic({ ...selectedMusic, bpm: parseInt(e.target.value) || undefined })}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">Update</Button>
        </DialogActions>
      </Dialog>

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
