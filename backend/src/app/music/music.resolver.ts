import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseInterceptors, UploadedFile, UploadedFiles } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { CreateMusicInput, UpdateMusicInput, MusicSearchInput, Music } from './music.dto';
import * as GraphQLUpload from 'graphql-upload/GraphQLUpload.js';

@Resolver(() => Music)
export class MusicResolver {
  constructor(private readonly musicService: MusicService) {}

  @Mutation(() => Music)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },
    { name: 'sheetMusic', maxCount: 1 }
  ]))
  async createMusic(
    @Args('createMusicInput') createMusicInput: CreateMusicInput,
    @UploadedFiles() files: { file?: Express.Multer.File[], sheetMusic?: Express.Multer.File[] },
  ): Promise<Music> {
    const file = files?.file?.[0];
    const sheetMusic = files?.sheetMusic?.[0];

    if (!file) {
      throw new Error('Audio file is required');
    }

    return this.musicService.createMusic(createMusicInput, file, sheetMusic);
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
