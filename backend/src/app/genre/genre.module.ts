import { Module } from '@nestjs/common';
import { GenreService } from './genre.service';
import { GenreResolver } from './genre.resolver';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  providers: [GenreService, GenreResolver],
  exports: [GenreService],
})
export class GenreModule {}
