import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
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

  // Chunked upload: start → chunk (raw application/octet-stream body, repeated) → preview → import.
  @Post('upload')
  async startUpload() {
    return this.snapshotService.startUpload();
  }

  @Post('upload/:uploadId/chunk')
  async uploadChunk(
    @Param('uploadId') uploadId: string,
    @Query('offset') offset: string,
    @Req() request: Request,
  ) {
    const parsedOffset = Number(offset);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      throw new BadRequestException('Query parameter "offset" must be a non-negative integer');
    }
    return this.snapshotService.appendUploadChunk(uploadId, parsedOffset, request);
  }

  @Post('upload/:uploadId/preview')
  async preview(@Param('uploadId') uploadId: string) {
    return this.snapshotService.previewSnapshot(uploadId);
  }

  @Post('import')
  async importSnapshot(
    @Query('uploadId') uploadId: string | undefined,
    @Query('confirm') confirm?: string,
  ) {
    if (!uploadId) {
      throw new BadRequestException('Query parameter "uploadId" is required');
    }
    return this.snapshotService.importSnapshot(uploadId, confirm);
  }
}
