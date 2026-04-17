import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ModerationService } from './moderation.service';
import {
  ModerationText,
  ModerationCategory,
  CreateModerationTextInput,
  UpdateModerationTextInput,
  CreateModerationCategoryInput,
  ModerationTextFilterInput,
} from './moderation.dto';

@Resolver()
export class ModerationResolver {
  constructor(private readonly moderationService: ModerationService) {}

  @Query(() => [ModerationCategory])
  async moderationCategories(): Promise<ModerationCategory[]> {
    return this.moderationService.getCategories();
  }

  @Mutation(() => ModerationCategory)
  async createModerationCategory(
    @Args('input') input: CreateModerationCategoryInput,
  ): Promise<ModerationCategory> {
    return this.moderationService.createCategory(input);
  }

  @Mutation(() => Boolean)
  async deleteModerationCategory(
    @Args('uid', { type: () => ID }) uid: string,
  ): Promise<boolean> {
    return this.moderationService.deleteCategory(uid);
  }

  @Query(() => [ModerationText])
  async moderationTexts(
    @Args('filter', { nullable: true }) filter?: ModerationTextFilterInput,
  ): Promise<ModerationText[]> {
    return this.moderationService.getTexts(filter);
  }

  @Query(() => ModerationText)
  async moderationText(
    @Args('uid', { type: () => ID }) uid: string,
  ): Promise<ModerationText> {
    return this.moderationService.getTextById(uid);
  }

  @Mutation(() => ModerationText)
  async createModerationText(
    @Args('input') input: CreateModerationTextInput,
  ): Promise<ModerationText> {
    return this.moderationService.createText(input);
  }

  @Mutation(() => ModerationText)
  async updateModerationText(
    @Args('input') input: UpdateModerationTextInput,
  ): Promise<ModerationText> {
    return this.moderationService.updateText(input);
  }

  @Mutation(() => Boolean)
  async deleteModerationText(
    @Args('uid', { type: () => ID }) uid: string,
  ): Promise<boolean> {
    return this.moderationService.deleteText(uid);
  }

  @Mutation(() => ModerationText)
  async duplicateModerationText(
    @Args('uid', { type: () => ID }) uid: string,
  ): Promise<ModerationText> {
    return this.moderationService.duplicateText(uid);
  }
}
