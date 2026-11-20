import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { MusicResolver } from './music.resolver';
import { MusicController } from './music.controller';
import { MinioService } from './minio.service';
import { DatabaseService } from '../database.service';

@Module({
  imports: [
    ConfigModule,
    // Uncompressed WAV is ~10-17 MB per minute, so the limit must be generous.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: (Number(config.get('MAX_UPLOAD_MB')) || 500) * 1024 * 1024,
        },
      }),
    }),
  ],
  controllers: [MusicController],
  providers: [MusicService, MusicResolver, MinioService, DatabaseService],
  exports: [MusicService, MinioService],
})
export class MusicModule {}
