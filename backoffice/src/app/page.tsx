'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  LinearProgress
} from '@mui/material';
import { MusicNote, Dashboard, QueueMusic, Comment, Download, UploadFile, Backup } from '@mui/icons-material';
import Link from 'next/link';

interface SnapshotCounts {
  songs: number;
  playlists: number;
  moderationTexts: number;
  moderationCategories: number;
  minioFiles: number;
  minioBytes: number;
}

interface SnapshotPreview {
  counts: SnapshotCounts;
  zipBytes: number;
  manifest?: {
    exportedAt: string;
    version: number;
  };
}

// Snapshots are uploaded in chunks so no request size/timeout limit applies.
const SNAPSHOT_CHUNK_BYTES = 32 * 1024 * 1024;

async function postSnapshotApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/snapshot/${path}`, { method: 'POST', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `Snapshot request failed (${response.status})`);
  return data as T;
}

async function uploadSnapshotFile(file: File, onProgress: (fraction: number) => void): Promise<string> {
  const { uploadId } = await postSnapshotApi<{ uploadId: string }>('upload');
  for (let offset = 0; offset < file.size; offset += SNAPSHOT_CHUNK_BYTES) {
    await postSnapshotApi(`upload/${uploadId}/chunk?offset=${offset}`, {
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file.slice(offset, offset + SNAPSHOT_CHUNK_BYTES),
    });
    onProgress(Math.min(offset + SNAPSHOT_CHUNK_BYTES, file.size) / file.size);
  }
  return uploadId;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function SnapshotCountsView({ counts }: { counts: SnapshotCounts }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mt: 1 }}>
      <Typography variant="body2">Songs: <strong>{counts.songs}</strong></Typography>
      <Typography variant="body2">Playlists: <strong>{counts.playlists}</strong></Typography>
      <Typography variant="body2">Moderationstexte: <strong>{counts.moderationTexts}</strong></Typography>
      <Typography variant="body2">Kategorien: <strong>{counts.moderationCategories}</strong></Typography>
      <Typography variant="body2">MinIO-Dateien: <strong>{counts.minioFiles}</strong></Typography>
      <Typography variant="body2">Nutzdaten: <strong>{formatBytes(counts.minioBytes)}</strong></Typography>
    </Box>
  );
}

export default function BackofficeHome() {
  const [snapshotStats, setSnapshotStats] = useState<SnapshotCounts | null>(null);
  const [snapshotUploadId, setSnapshotUploadId] = useState<string | null>(null);
  const [snapshotUploadProgress, setSnapshotUploadProgress] = useState<number | null>(null);
  const [snapshotPreview, setSnapshotPreview] = useState<SnapshotPreview | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [exportingSnapshot, setExportingSnapshot] = useState(false);
  const [importingSnapshot, setImportingSnapshot] = useState(false);

  async function loadSnapshotStats() {
    try {
      const response = await fetch('/api/snapshot/stats');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Snapshot stats failed');
      setSnapshotStats(data);
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    loadSnapshotStats();
  }, []);

  async function exportSnapshot() {
    setExportingSnapshot(true);
    setSnapshotError(null);
    setSnapshotMessage(null);

    try {
      const response = await fetch('/api/snapshot/export');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Snapshot export failed');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `track-planner-snapshot-${new Date().toISOString()}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setSnapshotMessage('Snapshot exportiert.');
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingSnapshot(false);
    }
  }

  async function previewSnapshot(file: File) {
    setSnapshotUploadId(null);
    setSnapshotPreview(null);
    setSnapshotError(null);
    setSnapshotMessage(null);
    setSnapshotUploadProgress(0);

    try {
      const uploadId = await uploadSnapshotFile(file, setSnapshotUploadProgress);
      setSnapshotPreview(await postSnapshotApi<SnapshotPreview>(`upload/${uploadId}/preview`));
      setSnapshotUploadId(uploadId);
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : String(error));
    } finally {
      setSnapshotUploadProgress(null);
    }
  }

  async function importSnapshot() {
    if (!snapshotUploadId || !snapshotPreview) return;
    setImportingSnapshot(true);
    setSnapshotError(null);
    setSnapshotMessage(null);

    try {
      await postSnapshotApi(`import?uploadId=${encodeURIComponent(snapshotUploadId)}&confirm=REPLACE_ALL_DATA`);
      setSnapshotMessage('Snapshot importiert. Die bestehenden Daten wurden ersetzt.');
      setSnapshotUploadId(null);
      setSnapshotPreview(null);
      await loadSnapshotStats();
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingSnapshot(false);
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Track Planner Backoffice
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Music Management System
        </Typography>
      </Box>

      <Grid container spacing={4} justifyContent="center">
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
              <MusicNote sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" component="h2" gutterBottom>
                Music Library
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upload, search, and manage your music collection. Edit metadata, organize by genre, and maintain your audio library.
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
              <Link href="/music" passHref>
                <Button variant="contained" startIcon={<MusicNote />}>
                  Manage Music
                </Button>
              </Link>
            </CardActions>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
              <QueueMusic sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" component="h2" gutterBottom>
                Playlists
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create, edit, and reorder playlists based on your music library.
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
              <Link href="/playlists" passHref>
                <Button variant="contained" startIcon={<QueueMusic />}>
                  Manage Playlists
                </Button>
              </Link>
            </CardActions>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
              <Comment sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" component="h2" gutterBottom>
                Moderation Library
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Moderationstexte anlegen und verwalten. Mit Kategorien, Autor und Datum.
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
              <Link href="/moderation" passHref>
                <Button variant="contained" startIcon={<Comment />}>
                  Moderationstexte
                </Button>
              </Link>
            </CardActions>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
              <Dashboard sx={{ fontSize: 60, color: 'secondary.main', mb: 2 }} />
              <Typography variant="h5" component="h2" gutterBottom>
                Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                View system statistics, monitor uploads, and get insights into your music library performance.
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
              <Button variant="outlined" startIcon={<Dashboard />} disabled>
                Coming Soon
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Backup sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h5" component="h2">
                    Snapshot Export / Import
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Exportiert Datenbank-Metadaten, Playlists, Moderationstexte und MinIO-Nutzdaten als ZIP.
                  </Typography>
                </Box>
              </Box>

              {snapshotStats && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Aktueller Export-Umfang</Typography>
                  <SnapshotCountsView counts={snapshotStats} />
                </Box>
              )}

              {snapshotError && <Alert severity="error" sx={{ mb: 2 }}>{snapshotError}</Alert>}
              {snapshotMessage && <Alert severity="success" sx={{ mb: 2 }}>{snapshotMessage}</Alert>}

              {snapshotUploadProgress !== null && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {snapshotUploadProgress < 1
                      ? `Snapshot wird hochgeladen… ${Math.floor(snapshotUploadProgress * 100)} %`
                      : 'Snapshot wird geprüft…'}
                  </Typography>
                  <LinearProgress
                    variant={snapshotUploadProgress < 1 ? 'determinate' : 'indeterminate'}
                    value={snapshotUploadProgress * 100}
                  />
                </Box>
              )}

              {snapshotPreview && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Import-Vorschau: Diese Daten ersetzen beim Import den aktuellen Bestand.
                  </Typography>
                  <SnapshotCountsView counts={snapshotPreview.counts} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    ZIP-Größe: <strong>{formatBytes(snapshotPreview.zipBytes)}</strong>
                    {snapshotPreview.manifest?.exportedAt
                      ? ` · Exportiert am ${new Date(snapshotPreview.manifest.exportedAt).toLocaleString('de-DE')}`
                      : ''}
                  </Typography>
                </Alert>
              )}
            </CardContent>
            <CardActions sx={{ justifyContent: 'center', gap: 1, flexWrap: 'wrap', pb: 2 }}>
              <Button
                variant="contained"
                startIcon={<Download />}
                onClick={exportSnapshot}
                disabled={exportingSnapshot}
              >
                {exportingSnapshot ? 'Exportiere...' : 'Snapshot exportieren'}
              </Button>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFile />}
                disabled={snapshotUploadProgress !== null || importingSnapshot}
              >
                Snapshot auswählen
                <input
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void previewSnapshot(file);
                    event.target.value = '';
                  }}
                />
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={importSnapshot}
                disabled={!snapshotUploadId || !snapshotPreview || importingSnapshot}
              >
                {importingSnapshot ? 'Importiere...' : 'Importieren und alles ersetzen'}
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Built with Next.js, Material-UI, NestJS, GraphQL, ArangoDB, and Minio
        </Typography>
      </Box>
    </Container>
  );
}
