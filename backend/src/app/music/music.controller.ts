import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { CreateMusicInput } from './music.dto';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'sheetMusic', maxCount: 1 },
    ])
  )
  async uploadMusic(
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      sheetMusic?: Express.Multer.File[];
    },
    @Body() createMusicInput: CreateMusicInput
  ) {
    const audioFile = files?.file?.[0];
    const sheetMusicFile = files?.sheetMusic?.[0];

    if (!audioFile) {
      throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);
    }

    return this.musicService.createMusic(
      createMusicInput,
      audioFile,
      sheetMusicFile
    );
  }
}
