'use client';

import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid
} from '@mui/material';
import { MusicNote, Dashboard } from '@mui/icons-material';
import Link from 'next/link';

export default function BackofficeHome() {
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
        <Grid item xs={12} sm={6} md={4}>
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

        <Grid item xs={12} sm={6} md={4}>
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
      </Grid>

      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Built with Next.js, Material-UI, NestJS, GraphQL, ArangoDB, and Minio
        </Typography>
      </Box>
    </Container>
  );
}
