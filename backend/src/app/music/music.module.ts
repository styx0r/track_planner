import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { MusicResolver } from './music.resolver';
import { MinioService } from './minio.service';
import { DatabaseService } from '../database.service';

@Module({
  imports: [
    ConfigModule,
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(new Error('Only audio files are allowed!'), false);
        }
      },
    }),
  ],
  providers: [MusicService, MusicResolver, MinioService, DatabaseService],
  exports: [MusicService],
})
export class MusicModule {}
