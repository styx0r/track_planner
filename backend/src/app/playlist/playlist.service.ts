import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  CreatePlaylistInput,
  UpdatePlaylistInput,
  Playlist,
  PlaylistTrack,
  PlaylistTrackSummary,
} from './playlist.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);
  private readonly collectionName = 'playlists';
  private readonly musicCollectionName = 'music';

  constructor(private readonly databaseService: DatabaseService) {}

  async createPlaylist(createPlaylistInput: CreatePlaylistInput): Promise<Playlist> {
    const db = this.databaseService.getDatabase();
    const collection = db.collection(this.collectionName);

    const playlistData = {
      uid: uuidv4(),
      name: createPlaylistInput.name,
      description: createPlaylistInput.description,
      tracks: this.normalizeTracks(createPlaylistInput.tracks),
      creation_timestamp: new Date(),
      update_timestamp: new Date(),
    };

    await collection.save(playlistData);
    this.logger.log(`Playlist created successfully: ${playlistData.uid}`);
    return this.hydratePlaylist(playlistData);
  }

  async updatePlaylist(updatePlaylistInput: UpdatePlaylistInput): Promise<Playlist> {
    const db = this.databaseService.getDatabase();
    const collection = db.collection(this.collectionName);

    const existing = await this.findPlaylistDocument(updatePlaylistInput.uid);

    const updateData: any = {
      update_timestamp: new Date(),
    };

    if (updatePlaylistInput.name !== undefined) {
      updateData.name = updatePlaylistInput.name;
    }

    if (updatePlaylistInput.description !== undefined) {
      updateData.description = updatePlaylistInput.description;
    }

    if (updatePlaylistInput.tracks !== undefined) {
      updateData.tracks = this.normalizeTracks(updatePlaylistInput.tracks);
    }

    await collection.update(existing._key, updateData);

    const updatedDoc = await collection.document(existing._key);
    this.logger.log(`Playlist updated successfully: ${updatePlaylistInput.uid}`);
    return this.hydratePlaylist(updatedDoc);
  }

  async deletePlaylist(uid: string): Promise<boolean> {
    const db = this.databaseService.getDatabase();
    const collection = db.collection(this.collectionName);

    const existing = await this.findPlaylistDocument(uid);
    await collection.remove(existing._key);
    this.logger.log(`Playlist deleted successfully: ${uid}`);
    return true;
  }

  async getPlaylists(): Promise<Playlist[]> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      `FOR doc IN @@collection SORT doc.update_timestamp DESC RETURN doc`,
      { '@collection': this.collectionName },
    );

    const documents = await cursor.all();
    return Promise.all(documents.map((doc) => this.hydratePlaylist(doc)));
  }

  async getPlaylist(uid: string): Promise<Playlist> {
    const existing = await this.findPlaylistDocument(uid);
    return this.hydratePlaylist(existing);
  }

  private async findPlaylistDocument(uid: string) {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      `FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc`,
      {
        '@collection': this.collectionName,
        uid,
      },
    );

    const documents = await cursor.all();
    if (documents.length === 0) {
      throw new NotFoundException(`Playlist with UID ${uid} not found`);
    }

    return documents[0];
  }

  private normalizeTracks(tracks?: { music_uid: string; order: number }[]) {
    if (!tracks || tracks.length === 0) {
      return [];
    }

    const uniqueMap = new Map<string, number>();
    tracks.forEach((track) => {
      if (!track.music_uid) return;
      uniqueMap.set(track.music_uid, track.order);
    });

    return Array.from(uniqueMap.entries())
      .map(([music_uid, order]) => ({ music_uid, order }))
      .sort((a, b) => a.order - b.order)
      .map((track, index) => ({ ...track, order: index }));
  }

  private async hydratePlaylist(doc: any): Promise<Playlist> {
    const tracks = Array.isArray(doc.tracks) ? doc.tracks : [];
    const musicSummaries = await this.fetchMusicSummaries(tracks.map((track) => track.music_uid));
    const playlistTracks: PlaylistTrack[] = tracks
      .sort((a, b) => a.order - b.order)
      .map((track) => ({
        music_uid: track.music_uid,
        order: track.order,
        music: musicSummaries[track.music_uid],
      }));

    return {
      uid: doc.uid,
      name: doc.name,
      description: doc.description,
      creation_timestamp: new Date(doc.creation_timestamp),
      update_timestamp: new Date(doc.update_timestamp),
      tracks: playlistTracks,
    };
  }

  private async fetchMusicSummaries(uids: string[]): Promise<Record<string, PlaylistTrackSummary>> {
    if (!uids.length) {
      return {};
    }

    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      `
        FOR doc IN @@collection
          FILTER doc.uid IN @uids
          RETURN { uid: doc.uid, title: doc.title, author: doc.author }
      `,
      {
        '@collection': this.musicCollectionName,
        uids,
      },
    );

    const documents = await cursor.all();
    return documents.reduce((acc, item) => {
      acc[item.uid] = item as PlaylistTrackSummary;
      return acc;
    }, {} as Record<string, PlaylistTrackSummary>);
  }
}


