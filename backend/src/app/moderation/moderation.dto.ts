import {
  ObjectType,
  InputType,
  Field,
  ID,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

@ObjectType()
export class ModerationCategory {
  @Field(() => ID)
  uid!: string;

  @Field()
  name!: string;

  @Field()
  is_builtin!: boolean;

  @Field()
  order!: number;
}

@ObjectType()
export class ModerationText {
  @Field(() => ID)
  uid!: string;

  @Field()
  author!: string;

  @Field(() => GraphQLISODateTime)
  creation_date!: Date;

  @Field()
  category!: string;

  @Field()
  text!: string;
}

@InputType()
export class CreateModerationTextInput {
  @Field()
  @IsString()
  author!: string;

  @Field(() => GraphQLISODateTime)
  creation_date!: Date;

  @Field()
  @IsString()
  category!: string;

  @Field()
  @IsString()
  text!: string;
}

@InputType()
export class UpdateModerationTextInput {
  @Field(() => ID)
  @IsString()
  uid!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  author?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  creation_date?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  text?: string;
}

@InputType()
export class CreateModerationCategoryInput {
  @Field()
  @IsString()
  name!: string;
}

@InputType()
export class ModerationTextFilterInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  author?: string;
}
