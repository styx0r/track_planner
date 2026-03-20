import {
  Controller,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseInterceptors,
  UploadedFiles,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import { CreateMusicInput } from './music.dto';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'sheetMusic', maxCount: 20 },
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
    const sheetMusicFiles = files?.sheetMusic || [];

    if (!audioFile) {
      throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);
    }

    return this.musicService.createMusic(
      createMusicInput,
      audioFile,
      sheetMusicFiles
    );
  }

  @Post(':uid/sheets')
  @UseInterceptors(FilesInterceptor('sheets', 20))
  async addSheets(
    @Param('uid') uid: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new HttpException('At least one sheet file is required', HttpStatus.BAD_REQUEST);
    }
    return this.musicService.addSheetsToMusic(uid, files);
  }

  @Delete(':uid/sheets/:sheetUid')
  async deleteSheet(
    @Param('uid') uid: string,
    @Param('sheetUid') sheetUid: string,
  ) {
    return this.musicService.deleteSheet(uid, sheetUid);
  }

  @Patch(':uid/sheets/reorder')
  async reorderSheets(
    @Param('uid') uid: string,
    @Body() body: { orderedUids: string[] },
  ) {
    return this.musicService.reorderSheets(uid, body.orderedUids);
  }
}
