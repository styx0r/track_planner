import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { CreateMusicInput, UpdateMusicInput, MusicSearchInput, Music } from './music.dto';
import * as GraphQLUpload from 'graphql-upload/GraphQLUpload.js';

@Resolver(() => Music)
export class MusicResolver {
  constructor(private readonly musicService: MusicService) {}

  @Mutation(() => Music)
  @UseInterceptors(FileInterceptor('file'))
  async createMusic(
    @Args('createMusicInput') createMusicInput: CreateMusicInput,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Music> {
    return this.musicService.createMusic(createMusicInput, file);
  }

  @Mutation(() => Music)
  async updateMusic(
    @Args('updateMusicInput') updateMusicInput: UpdateMusicInput,
  ): Promise<Music> {
    return this.musicService.updateMusic(updateMusicInput);
  }

  @Query(() => [Music])
  async searchMusic(
    @Args('searchInput', { nullable: true }) searchInput?: MusicSearchInput,
  ): Promise<Music[]> {
    return this.musicService.searchMusic(searchInput);
  }

  @Query(() => Music)
  async getMusicById(@Args('uid') uid: string): Promise<Music> {
    return this.musicService.getMusicById(uid);
  }

  @Mutation(() => Boolean)
  async deleteMusic(@Args('uid') uid: string): Promise<boolean> {
    return this.musicService.deleteMusic(uid);
  }
}
