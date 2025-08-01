import { Query, Resolver } from '@nestjs/graphql';
import { DatabaseService } from './database.service';

@Resolver()
export class AppResolver {
  constructor(private dbService: DatabaseService) {}

  @Query(() => String)
  hello(): string {
    return 'Hello from GraphQL!';
  }

  @Query(() => String)
  async checkDbConnection(): Promise<string> {
    try {
      const dbName = await this.dbService.db.get();
      return `Successfully connected to ArangoDB. Database name: ${dbName.name}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Failed to connect to ArangoDB: ${error.message}`;
      }
      return 'Failed to connect to ArangoDB: An unknown error occurred';
    }
  }
}
