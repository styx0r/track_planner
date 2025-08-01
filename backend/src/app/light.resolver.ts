import { Resolver, Query, Mutation, Int } from '@nestjs/graphql';
import { LightService } from './light.service';

@Resolver()
export class LightResolver {
  constructor(private readonly lightService: LightService) {}

  @Query(() => Int, { name: 'getLightState' })
  getLightState(): number {
    return this.lightService.getLightState();
  }

  @Mutation(() => Int, { name: 'switch' })
  switch(): number {
    return this.lightService.switchLight();
  }
}
