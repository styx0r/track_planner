import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as unzipper from 'unzipper';
import { DatabaseService } from '../database.service';
import { MinioObjectInfo, MinioService } from '../music/minio.service';

const SNAPSHOT_VERSION = 1;
const IMPORT_CONFIRMATION = 'REPLACE_ALL_DATA';
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
  files: Array<{ name: string; buffer: Buffer }>;
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly minioService: MinioService,
  ) {}

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

  async previewSnapshot(snapshotBuffer: Buffer): Promise<SnapshotPreview> {
    const parsed = await this.parseSnapshot(snapshotBuffer, false);
    return {
      manifest: parsed.manifest,
      counts: this.countSnapshotData(parsed.data, parsed.manifest.files),
      zipBytes: snapshotBuffer.length,
    };
  }

  async importSnapshot(snapshotBuffer: Buffer, confirmation?: string): Promise<SnapshotPreview> {
    if (confirmation !== IMPORT_CONFIRMATION) {
      throw new BadRequestException('Import confirmation is required');
    }

    const parsed = await this.parseSnapshot(snapshotBuffer, true);
    await this.replaceDatabaseData(parsed.data);
    await this.replaceMinioFiles(parsed.files);

    return {
      manifest: parsed.manifest,
      counts: this.countSnapshotData(parsed.data, parsed.files.map((file) => ({
        name: file.name,
        size: file.buffer.length,
      }))),
      zipBytes: snapshotBuffer.length,
    };
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

  private async parseSnapshot(buffer: Buffer, includeFiles: boolean): Promise<ParsedSnapshot> {
    const directory = await unzipper.Open.buffer(buffer);
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

    const files = includeFiles
      ? await Promise.all(
          directory.files
            .filter((entry) => entry.type === 'File' && entry.path.startsWith('files/'))
            .map(async (entry) => {
              const name = entry.path.slice('files/'.length);
              if (!name || name.startsWith('/') || name.includes('..')) {
                throw new BadRequestException(`Invalid snapshot file path: ${entry.path}`);
              }
              return { name, buffer: await entry.buffer() };
            }),
        )
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

  private async replaceMinioFiles(files: Array<{ name: string; buffer: Buffer }>): Promise<void> {
    await this.minioService.clearBucket();
    for (const file of files) {
      await this.minioService.putObject(file.name, file.buffer);
    }
  }
}
