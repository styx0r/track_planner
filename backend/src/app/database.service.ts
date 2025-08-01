import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'arangojs';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private _db!: Database;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('ARANGO_URL');
    const database = this.configService.get<string>('ARANGO_DATABASE');
    const user = this.configService.get<string>('ARANGO_USER');
    const password = this.configService.get<string>('ARANGO_PASSWORD');

    if (!url || !database || !user || !password) {
      throw new Error('Missing ArangoDB configuration. Please check your .env file.');
    }

    this._db = new Database({
      url,
      databaseName: database,
      auth: { username: user, password: password },
    });

    console.log('Successfully connected to ArangoDB.');
  }

  get db(): Database {
    return this._db;
  }
}
