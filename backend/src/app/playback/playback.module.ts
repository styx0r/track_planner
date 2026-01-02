import { Module } from '@nestjs/common';
import { PlaybackService } from './playback.service';
import { PlaybackGateway } from './playback.gateway';
import { PlaylistModule } from '../playlist/playlist.module';
import { MusicModule } from '../music/music.module';

@Module({
  imports: [PlaylistModule, MusicModule],
  providers: [PlaybackService, PlaybackGateway],
  exports: [PlaybackService],
})
export class PlaybackModule {}

