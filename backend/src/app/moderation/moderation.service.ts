import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  ModerationText,
  ModerationCategory,
  CreateModerationTextInput,
  UpdateModerationTextInput,
  CreateModerationCategoryInput,
  ModerationTextFilterInput,
} from './moderation.dto';
import { v4 as uuidv4 } from 'uuid';

const BUILTIN_CATEGORIES: Array<{ uid: string; name: string; order: number }> = [
  { uid: 'builtin-weihnachten', name: 'Weihnachten', order: 0 },
  { uid: 'builtin-ganzjaehrig', name: 'Ganzjährig', order: 1 },
];

@Injectable()
export class ModerationService implements OnModuleInit {
  private readonly logger = new Logger(ModerationService.name);
  private readonly textsCollection = 'moderation_texts';
  private readonly categoriesCollection = 'moderation_categories';

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    await this.ensureCollections();
    await this.ensureBuiltinCategories();
  }

  private async ensureCollections() {
    const db = this.databaseService.getDatabase();
    for (const name of [this.textsCollection, this.categoriesCollection]) {
      const col = db.collection(name);
      const exists = await col.exists();
      if (!exists) {
        await col.create();
        this.logger.log(`Created collection: ${name}`);
      }
    }
  }

  private async ensureBuiltinCategories() {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.categoriesCollection);

    for (const builtin of BUILTIN_CATEGORIES) {
      const cursor = await db.query(
        'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
        { '@collection': this.categoriesCollection, uid: builtin.uid },
      );
      const existing = await cursor.all();
      if (existing.length === 0) {
        await col.save({
          uid: builtin.uid,
          name: builtin.name,
          is_builtin: true,
          order: builtin.order,
        });
        this.logger.log(`Created builtin category: ${builtin.name}`);
      }
    }
  }

  async getCategories(): Promise<ModerationCategory[]> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'FOR doc IN @@collection SORT doc.order ASC, doc.name ASC RETURN doc',
      { '@collection': this.categoriesCollection },
    );
    return cursor.all();
  }

  async createCategory(input: CreateModerationCategoryInput): Promise<ModerationCategory> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.categoriesCollection);

    const existing = await this.getCategories();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.order)) : 1;

    const category: ModerationCategory = {
      uid: uuidv4(),
      name: input.name,
      is_builtin: false,
      order: maxOrder + 1,
    };

    await col.save(category);
    this.logger.log(`Created moderation category: ${category.name}`);
    return category;
  }

  async deleteCategory(uid: string): Promise<boolean> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.categoriesCollection);

    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
      { '@collection': this.categoriesCollection, uid },
    );
    const docs = await cursor.all();

    if (docs.length === 0) {
      throw new NotFoundException(`Category ${uid} not found`);
    }

    const category = docs[0];
    if (category.is_builtin) {
      throw new BadRequestException('Built-in categories cannot be deleted');
    }

    // Check if any texts reference this category
    const textCursor = await db.query(
      'FOR doc IN @@collection FILTER doc.category == @name RETURN 1',
      { '@collection': this.textsCollection, name: category.name },
    );
    const usages = await textCursor.all();
    if (usages.length > 0) {
      throw new BadRequestException(
        `Cannot delete category "${category.name}" — ${usages.length} moderation text(s) still use it`,
      );
    }

    await col.remove(category._key);
    this.logger.log(`Deleted moderation category: ${category.name}`);
    return true;
  }

  async getTexts(filter?: ModerationTextFilterInput): Promise<ModerationText[]> {
    const db = this.databaseService.getDatabase();
    let query = 'FOR doc IN @@collection';
    const bindVars: any = { '@collection': this.textsCollection };
    const filters: string[] = [];

    if (filter?.category) {
      filters.push('doc.category == @category');
      bindVars.category = filter.category;
    }
    if (filter?.author) {
      filters.push('CONTAINS(LOWER(doc.author), LOWER(@author))');
      bindVars.author = filter.author;
    }

    if (filters.length > 0) {
      query += ' FILTER ' + filters.join(' AND ');
    }
    query += ' SORT doc.creation_date DESC RETURN doc';

    const cursor = await db.query(query, bindVars);
    const docs = await cursor.all();
    return docs.map(this.docToText);
  }

  async getTextById(uid: string): Promise<ModerationText> {
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
      { '@collection': this.textsCollection, uid },
    );
    const docs = await cursor.all();
    if (docs.length === 0) throw new NotFoundException(`ModerationText ${uid} not found`);
    return this.docToText(docs[0]);
  }

  async createText(input: CreateModerationTextInput): Promise<ModerationText> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.textsCollection);

    const doc = {
      uid: uuidv4(),
      author: input.author,
      creation_date: input.creation_date,
      category: input.category,
      text: input.text,
    };

    await col.save(doc);
    this.logger.log(`Created moderation text: ${doc.uid}`);
    return this.docToText(doc);
  }

  async updateText(input: UpdateModerationTextInput): Promise<ModerationText> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.textsCollection);

    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
      { '@collection': this.textsCollection, uid: input.uid },
    );
    const docs = await cursor.all();
    if (docs.length === 0) throw new NotFoundException(`ModerationText ${input.uid} not found`);

    const updateData: any = {};
    if (input.author !== undefined) updateData.author = input.author;
    if (input.creation_date !== undefined) updateData.creation_date = input.creation_date;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.text !== undefined) updateData.text = input.text;

    await col.update(docs[0]._key, updateData);
    const updated = await col.document(docs[0]._key);
    return this.docToText(updated);
  }

  async deleteText(uid: string): Promise<boolean> {
    const db = this.databaseService.getDatabase();
    const col = db.collection(this.textsCollection);

    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid == @uid RETURN doc',
      { '@collection': this.textsCollection, uid },
    );
    const docs = await cursor.all();
    if (docs.length === 0) throw new NotFoundException(`ModerationText ${uid} not found`);

    await col.remove(docs[0]._key);
    return true;
  }

  async duplicateText(uid: string): Promise<ModerationText> {
    const original = await this.getTextById(uid);
    return this.createText({
      author: original.author,
      creation_date: new Date(),
      category: original.category,
      text: original.text,
    });
  }

  async getTextsByUids(uids: string[]): Promise<ModerationText[]> {
    if (!uids.length) return [];
    const db = this.databaseService.getDatabase();
    const cursor = await db.query(
      'FOR doc IN @@collection FILTER doc.uid IN @uids RETURN doc',
      { '@collection': this.textsCollection, uids },
    );
    const docs = await cursor.all();
    return docs.map(this.docToText);
  }

  private docToText(doc: any): ModerationText {
    return {
      uid: doc.uid,
      author: doc.author,
      creation_date: new Date(doc.creation_date),
      category: doc.category,
      text: doc.text,
    };
  }
}
