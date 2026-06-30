import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { MinioService } from '../music/minio.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  CreatePlaylistInput,
  UpdatePlaylistInput,
  Playlist,
  PlaylistItem,
  PlaylistItemType,
  PlaylistItemInput,
  PlaylistTrackSummary,
  ModerationTextSummary,
} from './playlist.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);
  private readonly collectionName = 'playlists';
  private readonly musicCollectionName = 'music';

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly minioService: MinioService,
    private readonly moderationService: ModerationService,
  ) {}

  async createPlaylist(createPlaylistInput: CreatePlaylistInput): Promise<Playlist> {
    const db = this.databaseService.getDatabase();
    const collection = db.collection(this.collectionName);

    const playlistData = {
      uid: uuidv4(),
      name: createPlaylistInput.name,
      description: createPlaylistInput.description,
      items: this.normalizeItems(createPlaylistInput.items),
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

    if (updatePlaylistInput.items !== undefined) {
      updateData.items = this.normalizeItems(updatePlaylistInput.items);
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
      { '@collection': this.collectionName, uid },
    );

    const documents = await cursor.all();
    if (documents.length === 0) {
      throw new NotFoundException(`Playlist with UID ${uid} not found`);
    }

    return documents[0];
  }

  private normalizeItems(items?: PlaylistItemInput[]): any[] {
    if (!items || items.length === 0) return [];

    for (const item of items) {
      if (item.type === PlaylistItemType.TRACK) {
        if (!item.music_uid) {
          throw new BadRequestException('TRACK items must include music_uid');
        }
      }

      if (item.type === PlaylistItemType.MODERATION_TEXT && !item.moderation_text_uid) {
        throw new BadRequestException('MODERATION_TEXT items must include moderation_text_uid');
      }
    }

    return [...items]
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        type: item.type,
        order: index,
        performer: item.performer || undefined,
        music_uid: item.type === PlaylistItemType.TRACK ? item.music_uid : undefined,
        metronome_enabled_override:
          item.type === PlaylistItemType.TRACK ? item.metronome_enabled_override : undefined,
        moderation_text_uid:
          item.type === PlaylistItemType.MODERATION_TEXT ? item.moderation_text_uid : undefined,
      }));
  }

  private async hydratePlaylist(doc: any): Promise<Playlist> {
    let rawItems: any[] = [];

    if (Array.isArray(doc.items) && doc.items.length > 0) {
      rawItems = doc.items;
    } else {
      // Legacy migration: old docs have separate tracks + moderation_text_uids
      const tracks = Array.isArray(doc.tracks) ? doc.tracks : [];
      const modUids: string[] = Array.isArray(doc.moderation_text_uids)
        ? doc.moderation_text_uids
        : [];
      rawItems = [
        ...tracks.map((t: any) => ({
          type: PlaylistItemType.TRACK,
          order: t.order ?? 0,
          performer: t.performer_override,
          music_uid: t.music_uid,
          metronome_enabled_override: t.metronome_enabled_override,
        })),
        ...modUids.map((uid: string, i: number) => ({
          type: PlaylistItemType.MODERATION_TEXT,
          order: tracks.length + i,
          moderation_text_uid: uid,
        })),
      ];
    }

    const sorted = [...rawItems].sort((a, b) => a.order - b.order);

    const trackUids = sorted
      .filter((i) => i.type === PlaylistItemType.TRACK && i.music_uid)
      .map((i) => i.music_uid);
    const modUids = sorted
      .filter((i) => i.type === PlaylistItemType.MODERATION_TEXT && i.moderation_text_uid)
      .map((i) => i.moderation_text_uid);

    const [musicSummaries, moderationSummaries] = await Promise.all([
      this.fetchMusicSummaries(trackUids),
      this.fetchModerationSummaries(modUids),
    ]);

    const items: PlaylistItem[] = sorted.map((item) => {
      const coerceBool = (v: any): boolean | undefined =>
        v == null ? undefined : v === true || v === 'true';

      if (item.type === PlaylistItemType.TRACK) {
        return {
          type: PlaylistItemType.TRACK,
          order: item.order,
          performer: item.performer || undefined,
          music_uid: item.music_uid,
          metronome_enabled_override: coerceBool(item.metronome_enabled_override),
          music: musicSummaries[item.music_uid],
        };
      } else {
        return {
          type: PlaylistItemType.MODERATION_TEXT,
          order: item.order,
          performer: item.performer || undefined,
          moderation_text_uid: item.moderation_text_uid,
          moderation_text: moderationSummaries[item.moderation_text_uid],
        };
      }
    });

    return {
      uid: doc.uid,
      name: doc.name,
      description: doc.description,
      creation_timestamp: new Date(doc.creation_timestamp),
      update_timestamp: new Date(doc.update_timestamp),
      items,
    };
  }

  private async fetchMusicSummaries(uids: string[]): Promise<Record<string, PlaylistTrackSummary>> {
    if (!uids.length) return {};

    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      `
        FOR doc IN @@collection
          FILTER doc.uid IN @uids
          RETURN {
            uid: doc.uid,
            title: doc.title,
            author: doc.author,
            presentation_type: doc.presentation_type,
            performer: doc.performer,
            bpm: doc.bpm,
            duration: doc.duration,
            waveform: doc.waveform,
            version: doc.version,
            time_signature: doc.time_signature,
            key: doc.key,
            metronome_default_enabled: doc.metronome_default_enabled,
            file_name: doc.file_name,
            sheets: doc.sheets,
            sheet_music_name: doc.sheet_music_name
          }
      `,
      { '@collection': this.musicCollectionName, uids },
    );

    const documents = await cursor.all();
    const result: Record<string, PlaylistTrackSummary> = {};

    for (const item of documents) {
      const coerceBool = (v: any): boolean | undefined =>
        v == null ? undefined : v === true || v === 'true';

      const summary: PlaylistTrackSummary = {
        uid: item.uid,
        title: item.title,
        author: item.author,
        presentation_type: item.presentation_type,
        performer: item.performer,
        bpm: item.bpm,
        duration: item.duration,
        waveform: Array.isArray(item.waveform) ? item.waveform : undefined,
        version: item.version,
        time_signature: item.time_signature,
        key: item.key,
        metronome_default_enabled: coerceBool(item.metronome_default_enabled),
        file_name: item.file_name,
        sheets: [],
      };

      if (item.file_name) {
        try {
          summary.file_url = await this.minioService.getFileUrl(item.file_name);
        } catch {
          summary.file_url = undefined;
        }
      }

      if (item.sheets && item.sheets.length > 0) {
        summary.sheets = await Promise.all(
          item.sheets.map(async (sheet: any) => {
            try {
              const url = await this.minioService.getFileUrl(sheet.file_name);
              const r: any = { ...sheet, url };
              if (sheet.thumbnail_name) {
                r.thumbnail_url = await this.minioService.getFileUrl(sheet.thumbnail_name);
              }
              return r;
            } catch {
              return sheet;
            }
          }),
        );
      } else if (item.sheet_music_name) {
        try {
          const url = await this.minioService.getFileUrl(item.sheet_music_name);
          summary.sheets = [{
            uid: 'legacy-' + item.uid,
            file_name: item.sheet_music_name,
            original_name: item.sheet_music_name,
            url,
            order: 0,
            mime_type: 'application/pdf',
          }];
        } catch {
          this.logger.warn(`Could not refresh sheet music URL for: ${item.sheet_music_name}`);
        }
      }

      result[item.uid] = summary;
    }

    return result;
  }

  private async fetchModerationSummaries(
    uids: string[],
  ): Promise<Record<string, ModerationTextSummary>> {
    if (!uids.length) return {};

    const texts = await this.moderationService.getTextsByUids(uids);
    const result: Record<string, ModerationTextSummary> = {};
    for (const t of texts) {
      result[t.uid] = { uid: t.uid, text: t.text, author: t.author, category: t.category };
    }
    return result;
  }
}
