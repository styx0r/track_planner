import {
  InputType,
  ObjectType,
  Field,
  ID,
  registerEnumType,
  Int,
} from '@nestjs/graphql';
import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

export enum PresentationType {
  LIVE = 'LIVE',
  STUDIO = 'STUDIO',
  REMIX = 'REMIX',
  ACOUSTIC = 'ACOUSTIC',
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
export class Music {
  @Field(() => ID)
  uid: string;

  @Field()
  creation_timestamp: Date;

  @Field()
  update_timestamp: Date;

  @Field()
  title: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field()
  author: string;

  @Field({ nullable: true })
  version?: string;

  @Field(() => PresentationType)
  presentation_type: PresentationType;

  @Field(() => Genre)
  genre: Genre;

  @Field(() => Int, { nullable: true })
  bpm?: number;

  @Field()
  file_url: string;

  @Field()
  file_name: string;
}

@InputType()
export class CreateMusicInput {
  @Field()
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field()
  @IsString()
  author: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  version?: string;

  @Field(() => PresentationType)
  @IsEnum(PresentationType)
  presentation_type: PresentationType;

  @Field(() => Genre)
  @IsEnum(Genre)
  genre: Genre;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  bpm?: number;
}

@InputType()
export class UpdateMusicInput {
  @Field(() => ID)
  @IsString()
  uid: string;

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
