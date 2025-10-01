import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { MinioService } from './minio.service';
import { CreateMusicInput, UpdateMusicInput, MusicSearchInput, Music } from './music.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private readonly collectionName = 'music';

  constructor(
    private databaseService: DatabaseService,
    private minioService: MinioService,
  ) {}

  async createMusic(
    createMusicInput: CreateMusicInput,
    file: Express.Multer.File,
    sheetMusicFile?: Express.Multer.File,
  ): Promise<Music> {
    try {
      // Upload audio file to Minio
      const { fileName, url } = await this.minioService.uploadFile(file);

      // Upload sheet music if provided
      let sheetMusicFileName: string | undefined;
      let sheetMusicUrl: string | undefined;
      if (sheetMusicFile) {
        const sheetMusic = await this.minioService.uploadSheetMusic(sheetMusicFile);
        sheetMusicFileName = sheetMusic.fileName;
        sheetMusicUrl = sheetMusic.url;
      }

      // Create music document
      const musicData = {
        uid: uuidv4(),
        creation_timestamp: new Date(),
        update_timestamp: new Date(),
        file_url: url,
        file_name: fileName,
        sheet_music_url: sheetMusicUrl,
        sheet_music_name: sheetMusicFileName,
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

      // Refresh file URLs and convert timestamps
      const refreshedUrl = await this.minioService.getFileUrl(updatedDoc.file_name);
      const result = {
        ...updatedDoc,
        file_url: refreshedUrl,
        creation_timestamp: new Date(updatedDoc.creation_timestamp),
        update_timestamp: new Date(updatedDoc.update_timestamp),
      };

      if (updatedDoc.sheet_music_name) {
        const refreshedSheetMusicUrl = await this.minioService.getFileUrl(updatedDoc.sheet_music_name);
        result.sheet_music_url = refreshedSheetMusicUrl;
      }

      this.logger.log(`Music updated successfully: ${updateMusicInput.uid}`);
      return result as Music;
    } catch (error) {
      this.logger.error(`Error updating music: ${error.message}`);
      throw error;
    }
  }

  async searchMusic(searchInput?: MusicSearchInput): Promise<Music[]> {
    try {
      const db = this.databaseService.getDatabase();
      const collection = db.collection(this.collectionName);

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

      // Refresh file URLs for all documents
      const musicList = await Promise.all(
        documents.map(async (doc) => {
          try {
            const refreshedUrl = await this.minioService.getFileUrl(doc.file_name);
            const updatedDoc = {
              ...doc,
              file_url: refreshedUrl,
              creation_timestamp: new Date(doc.creation_timestamp),
              update_timestamp: new Date(doc.update_timestamp),
            };

            if (doc.sheet_music_name) {
              const refreshedSheetMusicUrl = await this.minioService.getFileUrl(doc.sheet_music_name);
              updatedDoc.sheet_music_url = refreshedSheetMusicUrl;
            }

            return updatedDoc as Music;
          } catch (error) {
            this.logger.warn(`Could not refresh URL for file: ${doc.file_name}`);
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

      const doc = documents[0];

      // Refresh file URLs and convert timestamps
      const refreshedUrl = await this.minioService.getFileUrl(doc.file_name);
      const result = {
        ...doc,
        file_url: refreshedUrl,
        creation_timestamp: new Date(doc.creation_timestamp),
        update_timestamp: new Date(doc.update_timestamp),
      };

      if (doc.sheet_music_name) {
        const refreshedSheetMusicUrl = await this.minioService.getFileUrl(doc.sheet_music_name);
        result.sheet_music_url = refreshedSheetMusicUrl;
      }

      return result as Music;
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

      // Delete files from Minio
      await this.minioService.deleteFile(doc.file_name);
      if (doc.sheet_music_name) {
        await this.minioService.deleteFile(doc.sheet_music_name);
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
}
