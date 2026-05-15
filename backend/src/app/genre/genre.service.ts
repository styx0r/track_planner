import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { Genre, CreateGenreInput } from './genre.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GenreService implements OnModuleInit {
  private readonly logger = new Logger(GenreService.name);
  private readonly collectionName = 'genres';

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    await this.ensureCollection();
  }

  private async ensureCollection() {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.collectionName);
    const exists = await col.exists();
    if (!exists) {
      await col.create();
      this.logger.log(`Created collection: ${this.collectionName}`);
    }
  }

  async getGenres(): Promise<Genre[]> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'FOR doc IN @@collection SORT doc.order ASC, doc.name ASC RETURN doc',
      { '@collection': this.collectionName },
    );
    return cursor.all();
  }

  async createGenre(input: CreateGenreInput): Promise<Genre> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.collectionName);

    const name = input.name.trim();
    if (!name) throw new BadRequestException('Genre name must not be empty');

    const existing = await this.getGenres();
    const duplicate = existing.find(
      (g) => g.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new ConflictException(`Genre "${name}" already exists`);
    }

    const maxOrder = existing.length > 0 ? Math.max(...existing.map((g) => g.order)) : -1;

    const genre: Genre = {
      uid: uuidv4(),
      name,
      order: maxOrder + 1,
    };

    await col.save(genre);
    this.logger.log(`Created genre: ${genre.name}`);
    return genre;
  }

  async deleteGenre(uid: string): Promise<boolean> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.collectionName);

    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
      { '@collection': this.collectionName, uid },
    );
    const docs = await cursor.all();

    if (docs.length === 0) {
      throw new NotFoundException(`Genre ${uid} not found`);
    }

    await col.remove(docs[0]._key);
    this.logger.log(`Deleted genre: ${docs[0].name}`);
    return true;
  }
}
