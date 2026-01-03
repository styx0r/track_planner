import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { PlaylistService } from './playlist.service';
import { Playlist, CreatePlaylistInput, UpdatePlaylistInput } from './playlist.dto';

@Resolver(() => Playlist)
export class PlaylistResolver {
  constructor(private readonly playlistService: PlaylistService) {}

  @Query(() => [Playlist])
  async playlists(): Promise<Playlist[]> {
    return this.playlistService.getPlaylists();
  }

  @Query(() => Playlist)
  async playlist(@Args('uid') uid: string): Promise<Playlist> {
    return this.playlistService.getPlaylist(uid);
  }

  @Mutation(() => Playlist)
  async createPlaylist(
    @Args('createPlaylistInput') createPlaylistInput: CreatePlaylistInput,
  ): Promise<Playlist> {
    return this.playlistService.createPlaylist(createPlaylistInput);
  }

  @Mutation(() => Playlist)
  async updatePlaylist(
    @Args('updatePlaylistInput') updatePlaylistInput: UpdatePlaylistInput,
  ): Promise<Playlist> {
    return this.playlistService.updatePlaylist(updatePlaylistInput);
  }

  @Mutation(() => Boolean)
  async deletePlaylist(@Args('uid') uid: string): Promise<boolean> {
    return this.playlistService.deletePlaylist(uid);
  }
}





