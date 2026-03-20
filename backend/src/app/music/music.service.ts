import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { MinioService } from './minio.service';
import { CreateMusicInput, UpdateMusicInput, MusicSearchInput, Music, SheetMusic } from './music.dto';
import { v4 as uuidv4 } from 'uuid';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

// Converts the array returned by uploadSheetMusic into SheetMusic records starting at the given order index
async function uploadFileToSheets(
  minioService: MinioService,
  file: MulterFile,
  startOrder: number,
): Promise<SheetMusic[]> {
  const results = await minioService.uploadSheetMusic(file);
  return results.map((r, idx) => ({
    uid: uuidv4(),
    file_name: r.fileName,
    original_name: r.originalName,
    url: r.url,
    order: startOrder + idx,
    mime_type: 'image/png',
    thumbnail_name: r.thumbnailName,
    thumbnail_url: r.thumbnailUrl,
  }));
}

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private readonly collectionName = 'music';

  constructor(
    private databaseService: DatabaseService,
    private minioService: MinioService,
  ) {}

  private async refreshSheets(sheets: SheetMusic[]): Promise<SheetMusic[]> {
    return Promise.all(
      sheets.map(async (sheet) => {
        try {
          const url = await this.minioService.getFileUrl(sheet.file_name);
          const result: SheetMusic = { ...sheet, url };
          if (sheet.thumbnail_name) {
            result.thumbnail_url = await this.minioService.getFileUrl(sheet.thumbnail_name);
          }
          return result;
        } catch {
          return sheet;
        }
      })
    );
  }

  private async docToMusic(doc: any): Promise<Music> {
    const refreshedUrl = await this.minioService.getFileUrl(doc.file_name);
    const result: any = {
      ...doc,
      file_url: refreshedUrl,
      creation_timestamp: new Date(doc.creation_timestamp),
      update_timestamp: new Date(doc.update_timestamp),
    };

    // Handle sheets array (new format)
    if (doc.sheets && doc.sheets.length > 0) {
      result.sheets = await this.refreshSheets(doc.sheets);
    } else if (doc.sheet_music_name) {
      // Backward compatibility: migrate old single-sheet fields to sheets array
      const sheetUrl = await this.minioService.getFileUrl(doc.sheet_music_name);
      result.sheets = [{
        uid: 'legacy-' + doc.uid,
        file_name: doc.sheet_music_name,
        original_name: doc.sheet_music_name,
        url: sheetUrl,
        order: 0,
        mime_type: 'application/pdf',
      }];
    } else {
      result.sheets = [];
    }

    return result as Music;
  }

  async createMusic(
    createMusicInput: CreateMusicInput,
    file: Express.Multer.File,
    sheetMusicFiles?: Express.Multer.File[],
  ): Promise<Music> {
    try {
      // Upload audio file to Minio
      const { fileName, url } = await this.minioService.uploadFile(file);

      // Upload sheet music files (PDFs are expanded to one entry per page)
      const sheets: SheetMusic[] = [];
      if (sheetMusicFiles && sheetMusicFiles.length > 0) {
        for (const file of sheetMusicFiles) {
          const newSheets = await uploadFileToSheets(this.minioService, file, sheets.length);
          sheets.push(...newSheets);
        }
      }

      // Create music document
      const musicData = {
        uid: uuidv4(),
        creation_timestamp: new Date(),
        update_timestamp: new Date(),
        file_url: url,
        file_name: fileName,
        sheets,
        ...createMusicInput,
      };

      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      await collection.save(musicData);

      this.logger.log(`Music created successfully: ${musicData.uid}`);
      return musicData as Music;
    } catch (error) {
      this.logger.error(`Error creating music: ${error.message}`);
      throw new Error(`Failed to create music: ${error.message}`);
    }
  }

  async updateMusic(updateMusicInput: UpdateMusicInput): Promise<Music> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      // Find existing document
      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        {
          '@collection': this.collectionName,
          uid: updateMusicInput.uid,
        }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${updateMusicInput.uid} not found`);
      }

      const existingDoc = documents[0];

      // Update document
      const updateData = {
        ...updateMusicInput,
        update_timestamp: new Date(),
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await collection.update(existingDoc._key, updateData);

      // Fetch updated document
      const updatedDoc = await collection.document(existingDoc._key);

      this.logger.log(`Music updated successfully: ${updateMusicInput.uid}`);
      return this.docToMusic(updatedDoc);
    } catch (error) {
      this.logger.error(`Error updating music: ${error.message}`);
      throw error;
    }
  }

  async searchMusic(searchInput?: MusicSearchInput): Promise<Music[]> {
    try {
      const db = this.databaseService.getDatabase();

      let query = 'FOR doc IN @@collection';
      const bindVars: any = { '@collection': this.collectionName };

      if (searchInput) {
        const filters = [];

        if (searchInput.title) {
          filters.push('CONTAINS(LOWER(doc.title), LOWER(@title))');
          bindVars.title = searchInput.title;
        }

        if (searchInput.author) {
          filters.push('CONTAINS(LOWER(doc.author), LOWER(@author))');
          bindVars.author = searchInput.author;
        }

        if (searchInput.genre) {
          filters.push('doc.genre == @genre');
          bindVars.genre = searchInput.genre;
        }

        if (searchInput.presentation_type) {
          filters.push('doc.presentation_type == @presentation_type');
          bindVars.presentation_type = searchInput.presentation_type;
        }

        if (filters.length > 0) {
          query += ' FILTER ' + filters.join(' AND ');
        }
      }

      query += ' SORT doc.update_timestamp DESC RETURN doc';

      const cursor = await db.query(query, bindVars);
      const documents = await cursor.all();

      const musicList = await Promise.all(
        documents.map(async (doc) => {
          try {
            return await this.docToMusic(doc);
          } catch (error) {
            this.logger.warn(`Could not refresh URLs for: ${doc.uid}`);
            return doc as Music;
          }
        })
      );

      return musicList;
    } catch (error) {
      this.logger.error(`Error searching music: ${error.message}`);
      throw new Error(`Failed to search music: ${error.message}`);
    }
  }

  async getMusicById(uid: string): Promise<Music> {
    try {
      const db = this.databaseService.getDatabase();

      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        {
          '@collection': this.collectionName,
          uid: uid,
        }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${uid} not found`);
      }

      return this.docToMusic(documents[0]);
    } catch (error) {
      this.logger.error(`Error getting music by ID: ${error.message}`);
      throw error;
    }
  }

  async deleteMusic(uid: string): Promise<boolean> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      // Find existing document
      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        {
          '@collection': this.collectionName,
          uid: uid,
        }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${uid} not found`);
      }

      const doc = documents[0];

      // Delete audio file from Minio
      await this.minioService.deleteFile(doc.file_name);

      // Delete all sheet music files + thumbnails
      if (doc.sheets && doc.sheets.length > 0) {
        for (const sheet of doc.sheets) {
          await this.minioService.deleteFile(sheet.file_name).catch(() => {});
          if (sheet.thumbnail_name) {
            await this.minioService.deleteFile(sheet.thumbnail_name).catch(() => {});
          }
        }
      } else if (doc.sheet_music_name) {
        await this.minioService.deleteFile(doc.sheet_music_name).catch(() => {});
      }

      // Delete document from database
      await collection.remove(doc._key);

      this.logger.log(`Music deleted successfully: ${uid}`);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting music: ${error.message}`);
      throw error;
    }
  }

  async addSheetsToMusic(uid: string, files: Express.Multer.File[]): Promise<Music> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        { '@collection': this.collectionName, uid }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${uid} not found`);
      }

      const doc = documents[0];
      const existingSheets: SheetMusic[] = doc.sheets || [];
      const nextOrder = existingSheets.length > 0
        ? Math.max(...existingSheets.map((s: SheetMusic) => s.order)) + 1
        : 0;

      const newSheets: SheetMusic[] = [];
      for (const file of files) {
        const expanded = await uploadFileToSheets(this.minioService, file, nextOrder + newSheets.length);
        newSheets.push(...expanded);
      }

      const updatedSheets = [...existingSheets, ...newSheets];
      await collection.update(doc._key, {
        sheets: updatedSheets,
        update_timestamp: new Date(),
      });

      const updatedDoc = await collection.document(doc._key);
      this.logger.log(`Added ${newSheets.length} sheets to music: ${uid}`);
      return this.docToMusic(updatedDoc);
    } catch (error) {
      this.logger.error(`Error adding sheets: ${error.message}`);
      throw error;
    }
  }

  async deleteSheet(musicUid: string, sheetUid: string): Promise<Music> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        { '@collection': this.collectionName, uid: musicUid }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${musicUid} not found`);
      }

      const doc = documents[0];
      const sheets: SheetMusic[] = doc.sheets || [];
      const sheetToDelete = sheets.find((s: SheetMusic) => s.uid === sheetUid);

      if (!sheetToDelete) {
        throw new NotFoundException(`Sheet with UID ${sheetUid} not found`);
      }

      // Delete files from Minio
      await this.minioService.deleteFile(sheetToDelete.file_name).catch(() => {});
      if (sheetToDelete.thumbnail_name) {
        await this.minioService.deleteFile(sheetToDelete.thumbnail_name).catch(() => {});
      }

      // Remove sheet and re-normalize order
      const remaining = sheets
        .filter((s: SheetMusic) => s.uid !== sheetUid)
        .map((s: SheetMusic, idx: number) => ({ ...s, order: idx }));

      await collection.update(doc._key, {
        sheets: remaining,
        update_timestamp: new Date(),
      });

      const updatedDoc = await collection.document(doc._key);
      this.logger.log(`Deleted sheet ${sheetUid} from music ${musicUid}`);
      return this.docToMusic(updatedDoc);
    } catch (error) {
      this.logger.error(`Error deleting sheet: ${error.message}`);
      throw error;
    }
  }

  async reorderSheets(musicUid: string, orderedUids: string[]): Promise<Music> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        { '@collection': this.collectionName, uid: musicUid }
      );
      const documents = await cursor.all();

      if (documents.length === 0) {
        throw new NotFoundException(`Music with UID ${musicUid} not found`);
      }

      const doc = documents[0];
      const sheets: SheetMusic[] = doc.sheets || [];

      // Re-order sheets based on orderedUids
      const reordered = orderedUids
        .map((uid, idx) => {
          const sheet = sheets.find((s: SheetMusic) => s.uid === uid);
          return sheet ? { ...sheet, order: idx } : null;
        })
        .filter(Boolean);

      await collection.update(doc._key, {
        sheets: reordered,
        update_timestamp: new Date(),
      });

      const updatedDoc = await collection.document(doc._key);
      this.logger.log(`Reordered sheets for music ${musicUid}`);
      return this.docToMusic(updatedDoc);
    } catch (error) {
      this.logger.error(`Error reordering sheets: ${error.message}`);
      throw error;
    }
  }
}
