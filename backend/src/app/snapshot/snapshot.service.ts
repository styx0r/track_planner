import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Request, Response } from 'express';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { MinioObjectInfo, MinioService } from '../music/minio.service';

const SNAPSHOT_VERSION = 1;
const IMPORT_CONFIRMATION = 'REPLACE_ALL_DATA';
// Snapshots are uploaded in chunks to a temp file instead of one big request:
// no request size/timeout limit applies and nothing is held in memory.
const UPLOAD_DIR = path.join(os.tmpdir(), 'track-planner-snapshot-upload');
const COLLECTIONS = [
  'music',
  'playlists',
  'moderation_texts',
  'moderation_categories',
] as const;

type SnapshotCollection = typeof COLLECTIONS[number];
type SnapshotData = Record<SnapshotCollection, Record<string, unknown>[]>;

export interface SnapshotCounts {
  songs: number;
  playlists: number;
  moderationTexts: number;
  moderationCategories: number;
  minioFiles: number;
  minioBytes: number;
}

export interface SnapshotManifest {
  version: number;
  exportedAt: string;
  counts: SnapshotCounts;
  files: MinioObjectInfo[];
}

export interface SnapshotPreview {
  manifest: SnapshotManifest;
  counts: SnapshotCounts;
  zipBytes: number;
}

interface ParsedSnapshot {
  manifest: SnapshotManifest;
  data: SnapshotData;
  files: Array<{ name: string; entry: unzipper.File }>;
}

@Injectable()
export class SnapshotService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotService.name);
  // Only one pending upload at a time — starting a new one discards the old file.
  private pendingUpload: { id: string; filePath: string } | null = null;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly minioService: MinioService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Remove leftovers from uploads that were never imported (e.g. after a restart).
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
  }

  async startUpload(): Promise<{ uploadId: string }> {
    await this.discardPendingUpload();
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const id = uuidv4();
    const filePath = path.join(UPLOAD_DIR, `${id}.zip`);
    await fs.writeFile(filePath, '');
    this.pendingUpload = { id, filePath };
    return { uploadId: id };
  }

  async appendUploadChunk(uploadId: string, offset: number, chunk: Request): Promise<{ received: number }> {
    const filePath = this.getPendingUploadPath(uploadId);
    const { size } = await fs.stat(filePath);
    if (offset !== size) {
      throw new BadRequestException(`Unexpected chunk offset ${offset}, expected ${size}`);
    }
    await pipeline(chunk, createWriteStream(filePath, { flags: 'a' }));
    return { received: (await fs.stat(filePath)).size };
  }

  async getStats(): Promise<SnapshotCounts> {
    const [songs, playlists, moderationTexts, moderationCategories, minioFiles] = await Promise.all([
      this.countCollection('music'),
      this.countCollection('playlists'),
      this.countCollection('moderation_texts'),
      this.countCollection('moderation_categories'),
      this.minioService.listObjects(),
    ]);

    return {
      songs,
      playlists,
      moderationTexts,
      moderationCategories,
      minioFiles: minioFiles.length,
      minioBytes: minioFiles.reduce((sum, item) => sum + (item.size ?? 0), 0),
    };
  }

  async writeExportZip(output: Response): Promise<void> {
    const data = await this.readSnapshotData();
    const files = await this.minioService.listObjects();
    const manifest: SnapshotManifest = {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      counts: this.countSnapshotData(data, files),
      files,
    };

    const { ZipArchive } = await import(/* webpackIgnore: true */ 'archiver');
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (error) => this.logger.warn(error.message));
    archive.on('error', (error) => {
      throw error;
    });
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    for (const collection of COLLECTIONS) {
      archive.append(JSON.stringify(data[collection], null, 2), {
        name: `data/${collection}.json`,
      });
    }

    for (const file of files) {
      const stream = await this.minioService.getObjectStream(file.name);
      archive.append(stream, { name: `files/${file.name}` });
    }

    await archive.finalize();
  }

  async previewSnapshot(uploadId: string): Promise<SnapshotPreview> {
    const filePath = this.getPendingUploadPath(uploadId);
    try {
      const parsed = await this.parseSnapshot(filePath, false);
      return {
        manifest: parsed.manifest,
        counts: this.countSnapshotData(parsed.data, parsed.manifest.files),
        zipBytes: (await fs.stat(filePath)).size,
      };
    } catch (error) {
      // Invalid ZIP — no point keeping it around.
      await this.discardPendingUpload();
      throw error;
    }
  }

  async importSnapshot(uploadId: string, confirmation?: string): Promise<SnapshotPreview> {
    if (confirmation !== IMPORT_CONFIRMATION) {
      throw new BadRequestException('Import confirmation is required');
    }

    const filePath = this.getPendingUploadPath(uploadId);
    try {
      return await this.importSnapshotFile(filePath);
    } finally {
      await this.discardPendingUpload();
    }
  }

  private async importSnapshotFile(filePath: string): Promise<SnapshotPreview> {
    const parsed = await this.parseSnapshot(filePath, true);
    await this.replaceDatabaseData(parsed.data);
    await this.replaceMinioFiles(parsed.files);

    // Genres are not part of the snapshot, so imported songs may reference
    // genres that don't exist yet. Create the missing ones so the songs aren't
    // shown as orphaned ("–"). Never let this fail the import itself.
    try {
      await this.ensureGenresFromMusic(parsed.data.music);
    } catch (error) {
      this.logger.warn(
        `Could not sync genres from imported songs: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      manifest: parsed.manifest,
      counts: this.countSnapshotData(parsed.data, parsed.files.map((file) => ({
        name: file.name,
        size: file.entry.uncompressedSize,
      }))),
      zipBytes: (await fs.stat(filePath)).size,
    };
  }

  private getPendingUploadPath(uploadId: string): string {
    if (!this.pendingUpload || this.pendingUpload.id !== uploadId) {
      throw new NotFoundException('Snapshot upload not found — please upload the file again');
    }
    return this.pendingUpload.filePath;
  }

  private async discardPendingUpload(): Promise<void> {
    if (!this.pendingUpload) return;
    const { filePath } = this.pendingUpload;
    this.pendingUpload = null;
    await fs.rm(filePath, { force: true });
  }

  private async countCollection(collectionName: SnapshotCollection): Promise<number> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'RETURN LENGTH(@@collection)',
      { '@collection': collectionName },
    );
    const result = await cursor.next();
    return Number(result ?? 0);
  }

  private async readSnapshotData(): Promise<SnapshotData> {
    const result = {} as SnapshotData;
    await Promise.all(
      COLLECTIONS.map(async (collection) => {
        result[collection] = await this.readCollection(collection);
      }),
    );
    return result;
  }

  private async readCollection(collectionName: SnapshotCollection): Promise<Record<string, unknown>[]> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'FOR doc IN @@collection SORT doc._key RETURN UNSET(doc, "_key", "_id", "_rev")',
      { '@collection': collectionName },
    );
    return cursor.all();
  }

  private countSnapshotData(data: SnapshotData, files: Array<{ size?: number }>): SnapshotCounts {
    return {
      songs: data.music.length,
      playlists: data.playlists.length,
      moderationTexts: data.moderation_texts.length,
      moderationCategories: data.moderation_categories.length,
      minioFiles: files.length,
      minioBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    };
  }

  private async parseSnapshot(filePath: string, includeFiles: boolean): Promise<ParsedSnapshot> {
    let directory: unzipper.CentralDirectory;
    try {
      directory = await unzipper.Open.file(filePath);
    } catch {
      throw new BadRequestException('Snapshot is not a valid ZIP file');
    }
    const manifest = await this.readJsonEntry<SnapshotManifest>(directory, 'manifest.json');

    if (manifest.version !== SNAPSHOT_VERSION) {
      throw new BadRequestException(`Unsupported snapshot version: ${manifest.version}`);
    }

    const data = {} as SnapshotData;
    for (const collection of COLLECTIONS) {
      const docs = await this.readJsonEntry<unknown>(directory, `data/${collection}.json`);
      if (!Array.isArray(docs)) {
        throw new BadRequestException(`Invalid snapshot data for ${collection}`);
      }
      data[collection] = docs as Record<string, unknown>[];
    }

    // Only validate paths here — contents are streamed later during import.
    const files = includeFiles
      ? directory.files
          .filter((entry) => entry.type === 'File' && entry.path.startsWith('files/'))
          .map((entry) => {
            const name = entry.path.slice('files/'.length);
            if (!name || name.startsWith('/') || name.includes('..')) {
              throw new BadRequestException(`Invalid snapshot file path: ${entry.path}`);
            }
            return { name, entry };
          })
      : [];

    return { manifest, data, files };
  }

  private async readJsonEntry<T>(directory: unzipper.CentralDirectory, entryPath: string): Promise<T> {
    const entry = directory.files.find((file) => file.path === entryPath);
    if (!entry) {
      throw new BadRequestException(`Snapshot is missing ${entryPath}`);
    }

    try {
      return JSON.parse((await entry.buffer()).toString('utf8')) as T;
    } catch {
      throw new BadRequestException(`Snapshot contains invalid JSON in ${entryPath}`);
    }
  }

  private async replaceDatabaseData(data: SnapshotData): Promise<void> {
    const db = this.databaseService.getDatabase();

    for (const collectionName of COLLECTIONS) {
      const collection = db.collection(collectionName);
      if (!(await collection.exists())) {
        await collection.create();
      }
      await db.query('FOR doc IN @@collection REMOVE doc IN @@collection', {
        '@collection': collectionName,
      });
    }

    for (const collectionName of COLLECTIONS) {
      const collection = db.collection(collectionName);
      for (const doc of data[collectionName]) {
        await collection.save(doc);
      }
    }
  }

  private async ensureGenresFromMusic(musicDocs: Record<string, unknown>[]): Promise<void> {
    const db = this.databaseService.getDatabase();
    const collection = db.collection('genres');
    if (!(await collection.exists())) {
      await collection.create();
    }

    // Distinct, trimmed, non-empty genre names from the imported songs.
    const importedNames = new Map<string, string>(); // lowercase key -> original casing
    for (const doc of musicDocs) {
      const raw = doc['genre'];
      if (typeof raw !== 'string') continue;
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!importedNames.has(key)) importedNames.set(key, name);
    }
    if (importedNames.size === 0) return;

    const cursor = await db.query('FOR doc IN @@collection RETURN doc', {
      '@collection': 'genres',
    });
    const existing = await cursor.all();
    const existingNames = new Set(
      existing.map((g) => String(g.name ?? '').toLowerCase()),
    );
    let maxOrder = existing.reduce(
      (max, g) => Math.max(max, Number(g.order ?? -1)),
      -1,
    );

    let created = 0;
    for (const [key, name] of importedNames) {
      if (existingNames.has(key)) continue;
      maxOrder += 1;
      await collection.save({ uid: uuidv4(), name, order: maxOrder });
      existingNames.add(key);
      created += 1;
    }

    if (created > 0) {
      this.logger.log(`Created ${created} missing genre(s) from imported songs`);
    }
  }

  private async replaceMinioFiles(files: Array<{ name: string; entry: unzipper.File }>): Promise<void> {
    await this.minioService.clearBucket();
    for (const file of files) {
      await this.minioService.putObject(file.name, file.entry.stream(), file.entry.uncompressedSize);
    }
  }
}
