import { InputType, ObjectType, Field, ID } from '@nestjs/graphql';
import { IsString } from 'class-validator';

@ObjectType()
export class Genre {
  @Field(() => ID)
  uid!: string;

  @Field()
  name!: string;

  @Field()
  order!: number;
}

@InputType()
export class CreateGenreInput {
  @Field()
  @IsString()
  name!: string;
}
