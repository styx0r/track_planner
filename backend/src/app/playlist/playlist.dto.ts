import {
  ObjectType,
  InputType,
  Field,
  ID,
  Int,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

@ObjectType()
export class PlaylistTrackSummary {
  @Field(() => ID)
  uid!: string;

  @Field()
  title!: string;

  @Field()
  author!: string;

  @Field({ nullable: true })
  sheet_music_url?: string;

  @Field({ nullable: true })
  sheet_music_name?: string;
}

@ObjectType()
export class PlaylistTrack {
  @Field()
  music_uid!: string;

  @Field(() => Int)
  order!: number;

  @Field(() => PlaylistTrackSummary, { nullable: true })
  music?: PlaylistTrackSummary;
}

@ObjectType()
export class Playlist {
  @Field(() => ID)
  uid!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => GraphQLISODateTime)
  creation_timestamp!: Date;

  @Field(() => GraphQLISODateTime)
  update_timestamp!: Date;

  @Field(() => [PlaylistTrack])
  tracks!: PlaylistTrack[];
}

@InputType()
export class PlaylistTrackInput {
  @Field()
  @IsString()
  music_uid!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  order!: number;
}

@InputType()
export class CreatePlaylistInput {
  @Field()
  @IsString()
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => [PlaylistTrackInput], { defaultValue: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistTrackInput)
  tracks: PlaylistTrackInput[] = [];
}

@InputType()
export class UpdatePlaylistInput {
  @Field(() => ID)
  @IsString()
  uid!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => [PlaylistTrackInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistTrackInput)
  tracks?: PlaylistTrackInput[];
}



