import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DatabaseModule } from '../database.module';
import { MusicModule } from '../music/music.module';
import { SnapshotController } from './snapshot.controller';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [
    DatabaseModule,
    MusicModule,
    MulterModule.register({
      limits: {
        fileSize: 1024 * 1024 * 1024,
      },
    }),
  ],
  controllers: [SnapshotController],
  providers: [SnapshotService],
})
export class SnapshotModule {}
