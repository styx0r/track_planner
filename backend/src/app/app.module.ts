import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AppResolver } from './app.resolver';
import { DatabaseModule } from './database.module';
import { DatabaseService } from './database.service';
import { LightModule } from './light.module';
import { LightResolver } from './light.resolver';
import { LightService } from './light.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'backend/.env',
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
    }),
    DatabaseModule,
    LightModule,
  ],
  providers: [AppResolver, DatabaseService, LightResolver, LightService],
})
export class AppModule {}
