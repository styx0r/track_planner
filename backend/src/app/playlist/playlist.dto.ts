import {
  ObjectType,
  InputType,
  Field,
  ID,
  Int,
  GraphQLISODateTime,
  registerEnumType,
} from '@nestjs/graphql';
import { SheetMusic } from '../music/music.dto';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PlaylistItemType {
  TRACK = 'TRACK',
  MODERATION_TEXT = 'MODERATION_TEXT',
}
registerEnumType(PlaylistItemType, { name: 'PlaylistItemType' });

@ObjectType()
export class PlaylistTrackSummary {
  @Field(() => ID)
  uid!: string;

  @Field()
  title!: string;

  @Field()
  author!: string;

  @Field({ nullable: true })
  performer?: string;

  @Field(() => Int, { nullable: true })
  bpm?: number;

  @Field({ nullable: true })
  time_signature?: string;

  @Field(() => Boolean, { nullable: true })
  metronome_default_enabled?: boolean;

  @Field(() => [SheetMusic], { nullable: true })
  sheets?: SheetMusic[];
}

@ObjectType()
export class ModerationTextSummary {
  @Field(() => ID)
  uid!: string;

  @Field()
  text!: string;

  @Field()
  author!: string;

  @Field()
  category!: string;
}

@ObjectType()
export class PlaylistItem {
  @Field(() => PlaylistItemType)
  type!: PlaylistItemType;

  @Field(() => Int)
  order!: number;

  @Field({ nullable: true })
  performer?: string;

  // TRACK specific
  @Field({ nullable: true })
  music_uid?: string;

  @Field(() => Boolean, { nullable: true })
  metronome_enabled_override?: boolean;

  @Field(() => PlaylistTrackSummary, { nullable: true })
  music?: PlaylistTrackSummary;

  // MODERATION_TEXT specific
  @Field({ nullable: true })
  moderation_text_uid?: string;

  @Field(() => ModerationTextSummary, { nullable: true })
  moderation_text?: ModerationTextSummary;
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

  @Field(() => [PlaylistItem])
  items!: PlaylistItem[];
}

@InputType()
export class PlaylistItemInput {
  @Field(() => PlaylistItemType)
  @IsEnum(PlaylistItemType)
  type!: PlaylistItemType;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  order!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  performer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  music_uid?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  metronome_enabled_override?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  moderation_text_uid?: string;
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

  @Field(() => [PlaylistItemInput], { defaultValue: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemInput)
  items: PlaylistItemInput[] = [];
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

  @Field(() => [PlaylistItemInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemInput)
  items?: PlaylistItemInput[];
}
