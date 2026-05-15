import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { GenreService } from './genre.service';
import { Genre, CreateGenreInput } from './genre.dto';

@Resolver()
export class GenreResolver {
  constructor(private readonly genreService: GenreService) {}

  @Query(() => [Genre])
  async genres(): Promise<Genre[]> {
    return this.genreService.getGenres();
  }

  @Mutation(() => Genre)
  async createGenre(@Args('input') input: CreateGenreInput): Promise<Genre> {
    return this.genreService.createGenre(input);
  }

  @Mutation(() => Boolean)
  async deleteGenre(
    @Args('uid', { type: () => ID }) uid: string,
  ): Promise<boolean> {
    return this.genreService.deleteGenre(uid);
  }
}
