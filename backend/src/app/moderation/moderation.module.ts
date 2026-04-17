import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationResolver } from './moderation.resolver';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ModerationService, ModerationResolver],
  exports: [ModerationService],
})
export class ModerationModule {}
