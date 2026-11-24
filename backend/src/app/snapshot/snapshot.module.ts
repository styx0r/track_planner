import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { MusicModule } from '../music/music.module';
import { SnapshotController } from './snapshot.controller';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [DatabaseModule, MusicModule],
  controllers: [SnapshotController],
  providers: [SnapshotService],
})
export class SnapshotModule {}
