import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SnapshotService } from './snapshot.service';

@Controller('snapshot')
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  @Get('stats')
  async stats() {
    return this.snapshotService.getStats();
  }

  @Get('export')
  async exportSnapshot(@Res() response: Response) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="track-planner-snapshot-${timestamp}.zip"`,
    );

    await this.snapshotService.writeExportZip(response);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('snapshot'))
  async preview(@UploadedFile() snapshot?: Express.Multer.File) {
    if (!snapshot) {
      throw new BadRequestException('Snapshot ZIP file is required');
    }
    return this.snapshotService.previewSnapshot(snapshot.buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('snapshot'))
  async importSnapshot(
    @UploadedFile() snapshot: Express.Multer.File | undefined,
    @Query('confirm') confirm?: string,
  ) {
    if (!snapshot) {
      throw new BadRequestException('Snapshot ZIP file is required');
    }
    return this.snapshotService.importSnapshot(snapshot.buffer, confirm);
  }
}
