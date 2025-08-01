import { Test, TestingModule } from '@nestjs/testing';
import { LightResolver } from './light.resolver';

describe('LightResolver', () => {
  let resolver: LightResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LightResolver],
    }).compile();

    resolver = module.get<LightResolver>(LightResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
