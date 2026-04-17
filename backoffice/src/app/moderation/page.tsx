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
  IconButton,
  Chip,
  Snackbar,
  Alert,
  Tooltip,
  Divider,
  InputAdornment,
} from '@mui/material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import {
  ArrowBack,
  Add,
  Edit,
  Delete,
  ContentCopy,
  Comment,
  RemoveCircle,
} from '@mui/icons-material';

interface ModerationCategory {
  uid: string;
  name: string;
  is_builtin: boolean;
  order: number;
}

interface ModerationText {
  uid: string;
  author: string;
  creation_date: string;
  category: string;
  text: string;
}

const GQL_URL = '/api/graphql';
const gql = async (query: string, variables?: object) => {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
};

const toDateInputValue = (d: Date) => d.toISOString().split('T')[0];
const fromDateInputValue = (s: string) => s ? new Date(s) : new Date();

export default function ModerationPage() {
  const [texts, setTexts] = useState<ModerationText[]>([]);
  const [categories, setCategories] = useState<ModerationCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Text dialog
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [editingText, setEditingText] = useState<ModerationText | null>(null);
  const [textForm, setTextForm] = useState({ author: '', creation_date: toDateInputValue(new Date()), category: '', text: '' });

  // Category management
  const [newCategoryName, setNewCategoryName] = useState('');

  // Filter
  const [filterCategory, setFilterCategory] = useState('');

  const showSnack = (message: string, severity: 'success' | 'error' = 'success') =>
    setSnackbar({ open: true, message, severity });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await gql(`
        query {
          moderationTexts { uid author creation_date category text }
          moderationCategories { uid name is_builtin order }
        }
      `);
      setTexts(data.moderationTexts);
      setCategories(data.moderationCategories);
    } catch (e) {
      showSnack(`Fehler beim Laden: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreateDialog = useCallback(() => {
    setEditingText(null);
    setTextForm({ author: '', creation_date: toDateInputValue(new Date()), category: categories[0]?.name || '', text: '' });
    setTextDialogOpen(true);
  }, [categories]);

  const openEditDialog = useCallback((row: ModerationText) => {
    setEditingText(row);
    setTextForm({
      author: row.author,
      creation_date: toDateInputValue(new Date(row.creation_date)),
      category: row.category,
      text: row.text,
    });
    setTextDialogOpen(true);
  }, []);

  const closeTextDialog = useCallback(() => {
    setTextDialogOpen(false);
    setEditingText(null);
  }, []);

  const handleSaveText = useCallback(async () => {
    if (!textForm.author.trim() || !textForm.text.trim() || !textForm.category) {
      showSnack('Autor, Kategorie und Text sind Pflichtfelder', 'error');
      return;
    }
    try {
      if (editingText) {
        await gql(
          `mutation UpdateModerationText($input: UpdateModerationTextInput!) { updateModerationText(input: $input) { uid } }`,
          {
            input: {
              uid: editingText.uid,
              author: textForm.author,
              creation_date: fromDateInputValue(textForm.creation_date),
              category: textForm.category,
              text: textForm.text,
            },
          }
        );
        showSnack('Text aktualisiert');
      } else {
        await gql(
          `mutation CreateModerationText($input: CreateModerationTextInput!) { createModerationText(input: $input) { uid } }`,
          {
            input: {
              author: textForm.author,
              creation_date: fromDateInputValue(textForm.creation_date),
              category: textForm.category,
              text: textForm.text,
            },
          }
        );
        showSnack('Text erstellt');
      }
      closeTextDialog();
      await loadData();
    } catch (e) {
      showSnack(`Fehler: ${e}`, 'error');
    }
  }, [textForm, editingText, closeTextDialog, loadData]);

  const handleDelete = useCallback(async (uid: string) => {
    if (!confirm('Moderationstext wirklich löschen?')) return;
    try {
      await gql(`mutation { deleteModerationText(uid: "${uid}") }`);
      showSnack('Text gelöscht');
      await loadData();
    } catch (e) {
      showSnack(`Fehler: ${e}`, 'error');
    }
  }, [loadData]);

  const handleDuplicate = useCallback(async (uid: string) => {
    try {
      await gql(`mutation { duplicateModerationText(uid: "${uid}") { uid } }`);
      showSnack('Text dupliziert');
      await loadData();
    } catch (e) {
      showSnack(`Fehler: ${e}`, 'error');
    }
  }, [loadData]);

  const handleAddCategory = useCallback(async () => {
    if (!newCategoryName.trim()) return;
    try {
      await gql(
        `mutation CreateCategory($input: CreateModerationCategoryInput!) { createModerationCategory(input: $input) { uid } }`,
        { input: { name: newCategoryName.trim() } }
      );
      setNewCategoryName('');
      showSnack(`Kategorie "${newCategoryName.trim()}" erstellt`);
      await loadData();
    } catch (e) {
      showSnack(`Fehler: ${e}`, 'error');
    }
  }, [newCategoryName, loadData]);

  const handleDeleteCategory = useCallback(async (uid: string, name: string) => {
    if (!confirm(`Kategorie "${name}" löschen?`)) return;
    try {
      await gql(`mutation { deleteModerationCategory(uid: "${uid}") }`);
      showSnack(`Kategorie "${name}" gelöscht`);
      await loadData();
    } catch (e) {
      showSnack(`${e}`, 'error');
    }
  }, [loadData]);

  const filteredTexts = useMemo(
    () => (filterCategory ? texts.filter((t) => t.category === filterCategory) : texts),
    [texts, filterCategory]
  );

  const columns = useMemo<GridColDef[]>(() => [
    {
      field: 'category',
      headerName: 'Kategorie',
      width: 130,
      renderCell: (params) => <Chip label={params.value} size="small" color="primary" variant="outlined" />,
    },
    { field: 'author', headerName: 'Autor', width: 140 },
    {
      field: 'creation_date',
      headerName: 'Datum',
      width: 110,
      renderCell: (params) => new Date(params.value).toLocaleDateString('de-DE'),
    },
    {
      field: 'text',
      headerName: 'Text',
      flex: 1,
      renderCell: (params) => (
        <Tooltip title={params.value} placement="top-start">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}>
            {params.value}
          </span>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Aktionen',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          key="duplicate"
          icon={<ContentCopy />}
          label="Duplizieren"
          onClick={() => handleDuplicate(params.row.uid)}
        />,
        <GridActionsCellItem
          key="edit"
          icon={<Edit />}
          label="Bearbeiten"
          onClick={() => openEditDialog(params.row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<Delete />}
          label="Löschen"
          onClick={() => handleDelete(params.row.uid)}
          showInMenu
        />,
      ],
    },
  ], [handleDuplicate, openEditDialog, handleDelete]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button component={Link} href="/" variant="text" startIcon={<ArrowBack />}>
            Back
          </Button>
          <Box sx={{ flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Comment color="primary" />
              <Typography variant="h4" component="h1">
                Moderation Library
              </Typography>
            </Box>
            <Typography variant="subtitle1" color="text.secondary">
              Moderationstexte verwalten
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
            Neuer Text
          </Button>
        </Box>

        {/* Category management */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Kategorien
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            {categories.map((cat) => (
              <Chip
                key={cat.uid}
                label={cat.name}
                color={cat.is_builtin ? 'primary' : 'default'}
                variant={cat.is_builtin ? 'filled' : 'outlined'}
                onDelete={
                  cat.is_builtin
                    ? undefined
                    : () => handleDeleteCategory(cat.uid, cat.name)
                }
                deleteIcon={<RemoveCircle />}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              label="Neue Kategorie"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                      <Add fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Paper>

        {/* Filter + Table */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter: Kategorie</InputLabel>
            <Select
              value={filterCategory}
              label="Filter: Kategorie"
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <MenuItem value="">Alle</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.uid} value={cat.name}>{cat.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        <Paper sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={filteredTexts}
            columns={columns}
            getRowId={(row) => row.uid}
            loading={loading}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            disableRowSelectionOnClick
          />
        </Paper>

        {/* Text Create/Edit Dialog */}
        <Dialog open={textDialogOpen} onClose={closeTextDialog} maxWidth="sm" fullWidth>
          <DialogTitle>{editingText ? 'Moderationstext bearbeiten' : 'Neuer Moderationstext'}</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Autor"
              required
              value={textForm.author}
              onChange={(e) => setTextForm({ ...textForm, author: e.target.value })}
              sx={{ mt: 1 }}
            />
            <TextField
              fullWidth
              label="Erstelldatum"
              type="date"
              value={textForm.creation_date}
              onChange={(e) => setTextForm({ ...textForm, creation_date: e.target.value })}
              sx={{ mt: 2 }}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth required sx={{ mt: 2 }}>
              <InputLabel>Kategorie</InputLabel>
              <Select
                value={textForm.category}
                label="Kategorie"
                onChange={(e) => setTextForm({ ...textForm, category: e.target.value })}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat.uid} value={cat.name}>{cat.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Divider sx={{ my: 2 }} />
            <TextField
              fullWidth
              label="Text"
              required
              multiline
              rows={6}
              value={textForm.text}
              onChange={(e) => setTextForm({ ...textForm, text: e.target.value })}
              placeholder="Moderationstext eingeben..."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeTextDialog}>Abbrechen</Button>
            <Button variant="contained" onClick={handleSaveText}>
              {editingText ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
  );
}
