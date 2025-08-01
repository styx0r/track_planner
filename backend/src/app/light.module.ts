import { Module } from '@nestjs/common';
import { LightService } from './light.service';
import { LightResolver } from './light.resolver';

@Module({
  providers: [LightService, LightResolver],
})
export class LightModule {}
