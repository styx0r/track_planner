import { Module } from '@nestjs/common';
import { PlaylistResolver } from './playlist.resolver';
import { PlaylistService } from './playlist.service';
import { DatabaseModule } from '../database.module';
import { MusicModule } from '../music/music.module';

@Module({
  imports: [DatabaseModule, MusicModule],
  providers: [PlaylistResolver, PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}

