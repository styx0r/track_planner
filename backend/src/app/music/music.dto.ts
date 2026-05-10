import {
  InputType,
  ObjectType,
  Field,
  ID,
  registerEnumType,
  Int,
  Float,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';

export enum PresentationType {
  A_CAPELLA = 'A_CAPELLA',
  LIVE_PIANO = 'LIVE_PIANO',
  PLAYBACK = 'PLAYBACK',
}

export enum Genre {
  ROCK = 'ROCK',
  POP = 'POP',
  JAZZ = 'JAZZ',
  CLASSICAL = 'CLASSICAL',
  ELECTRONIC = 'ELECTRONIC',
  HIP_HOP = 'HIP_HOP',
  COUNTRY = 'COUNTRY',
  BLUES = 'BLUES',
  FOLK = 'FOLK',
  OTHER = 'OTHER',
}

// Register GraphQL enums
registerEnumType(PresentationType, { name: 'PresentationType' });
registerEnumType(Genre, { name: 'Genre' });

@ObjectType()
export class SheetMusic {
  @Field(() => ID)
  uid!: string;

  @Field()
  file_name!: string;

  @Field()
  original_name!: string;

  @Field()
  url!: string;

  @Field(() => Int)
  order!: number;

  @Field()
  mime_type!: string;

  @Field({ nullable: true })
  thumbnail_name?: string;

  @Field({ nullable: true })
  thumbnail_url?: string;
}

@ObjectType()
export class Music {
  @Field(() => ID)
  uid!: string;

  @Field(() => GraphQLISODateTime)
  creation_timestamp!: Date;

  @Field(() => GraphQLISODateTime)
  update_timestamp!: Date;

  @Field()
  title!: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field()
  author!: string;

  @Field({ nullable: true })
  version?: string;

  @Field(() => PresentationType)
  presentation_type!: PresentationType;

  @Field(() => Genre)
  genre!: Genre;

  @Field(() => Int, { nullable: true })
  bpm?: number;

  @Field(() => Int, { nullable: true, description: 'Metronome offset in milliseconds relative to song start' })
  metronome_offset?: number;

  @Field(() => Int, { nullable: true, description: 'Duration in seconds' })
  duration?: number;

  @Field(() => [Float], { nullable: true, description: 'Normalized waveform amplitudes for display' })
  waveform?: number[];

  @Field({ nullable: true })
  lyrics?: string;

  @Field({ nullable: true })
  file_url?: string;

  @Field({ nullable: true })
  file_name?: string;

  @Field({ nullable: true })
  performer?: string;

  @Field({ nullable: true })
  time_signature?: string;

  @Field({ nullable: true })
  key?: string;

  @Field(() => Boolean, { nullable: true })
  metronome_default_enabled?: boolean;

  @Field(() => [SheetMusic], { nullable: true })
  sheets?: SheetMusic[];
}

@InputType()
export class CreateMusicInput {
  @Field()
  @IsString()
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field()
  @IsString()
  author!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  version?: string;

  @Field(() => PresentationType)
  @IsEnum(PresentationType)
  presentation_type!: PresentationType;

  @Field(() => Genre)
  @IsEnum(Genre)
  genre!: Genre;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  bpm?: number;

  @Field(() => Int, { nullable: true, description: 'Metronome offset in milliseconds relative to song start' })
  @IsOptional()
  @IsNumber()
  metronome_offset?: number;

  @Field(() => Int, { nullable: true, description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  lyrics?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  performer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  time_signature?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  key?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  metronome_default_enabled?: boolean;
}

@InputType()
export class UpdateMusicInput {
  @Field(() => ID)
  @IsString()
  uid!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  author?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  version?: string;

  @Field(() => PresentationType, { nullable: true })
  @IsOptional()
  @IsEnum(PresentationType)
  presentation_type?: PresentationType;

  @Field(() => Genre, { nullable: true })
  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  bpm?: number;

  @Field(() => Int, { nullable: true, description: 'Metronome offset in milliseconds relative to song start' })
  @IsOptional()
  @IsNumber()
  metronome_offset?: number;

  @Field(() => Int, { nullable: true, description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  lyrics?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  performer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  time_signature?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  key?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  metronome_default_enabled?: boolean;
}

@InputType()
export class MusicSearchInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  author?: string;

  @Field(() => Genre, { nullable: true })
  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  @Field(() => PresentationType, { nullable: true })
  @IsOptional()
  @IsEnum(PresentationType)
  presentation_type?: PresentationType;
}
