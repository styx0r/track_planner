import { Module } from '@nestjs/common';
import { PlaylistResolver } from './playlist.resolver';
import { PlaylistService } from './playlist.service';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  providers: [PlaylistResolver, PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}

