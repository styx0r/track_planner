import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import * as path from 'path';
import { Readable } from 'stream';

// Minimal file type to avoid depending on Express types
interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

export interface SheetUploadResult {
  fileName: string;
  url: string;
  originalName: string;
  thumbnailName?: string;
  thumbnailUrl?: string;
}

export interface MinioObjectInfo {
  name: string;
  size: number;
  lastModified?: Date;
  etag?: string;
}

const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 280;
// Scale factor for PDF rendering: 2x = 144 DPI (decent quality for sheet music)
const PDF_RENDER_SCALE = 2;

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: MinioClient;
  private publicMinioClient: MinioClient;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    const accessKey = this.configService.get<string>(
      'MINIO_ACCESS_KEY',
      'minioadmin'
    );
    const secretKey = this.configService.get<string>(
      'MINIO_SECRET_KEY',
      'minioadmin'
    );
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const region = this.configService.get<string>(
      'MINIO_REGION',
      'eu-central-1'
    );

    this.minioClient = new MinioClient({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000')),
      useSSL,
      accessKey,
      secretKey,
      region,
    });

    this.publicMinioClient = new MinioClient({
      endPoint: this.configService.get<string>(
        'MINIO_PUBLIC_ENDPOINT',
        this.configService.get<string>('MINIO_ENDPOINT', 'localhost')
      ),
      port: parseInt(
        this.configService.get<string>(
          'MINIO_PUBLIC_PORT',
          this.configService.get<string>('MINIO_PORT', '9000')
        )
      ),
      useSSL:
        this.configService.get<string>(
          'MINIO_PUBLIC_USE_SSL',
          this.configService.get<string>('MINIO_USE_SSL', 'false')
        ) === 'true',
      accessKey,
      secretKey,
      region,
    });

    this.bucketName = this.configService.get<string>(
      'MINIO_BUCKET_NAME',
      'music-files'
    );
    void this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, this.configService.get<string>('MINIO_REGION', 'eu-central-1'));
        this.logger.log(`Created bucket: ${this.bucketName}`);
      }
    } catch (error: any) {
      this.logger.error(`Error ensuring bucket exists: ${error?.message}`);
    }
  }

  /**
   * Converts each page of a PDF buffer to a PNG buffer using mupdf (WASM, no native deps).
   * Returns one Buffer per page, in order.
   */
  private async convertPdfToImages(buffer: Buffer): Promise<Buffer[]> {
    // webpackIgnore keeps this as a native import() so Node resolves the ESM module directly
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mupdf = await import(/* webpackIgnore: true */ 'mupdf');
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
    const pageCount = doc.countPages();
    const scale = mupdf.Matrix.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE);
    const pages: Buffer[] = [];

    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(scale, mupdf.ColorSpace.DeviceRGB, false, true);
      const pngBytes = pixmap.asPNG();
      pages.push(Buffer.from(pngBytes));
    }

    return pages;
  }

  async uploadFile(
    file: UploadedFile
  ): Promise<{ fileName: string; url: string }> {
    const fileName = `${uuidv4()}-${file.originalname}`;

    try {
      await this.minioClient.putObject(
        this.bucketName,
        fileName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      const url = await this.createPublicGetUrl(fileName);

      this.logger.log(`File uploaded successfully: ${fileName}`);
      return { fileName, url };
    } catch (error: any) {
      this.logger.error(`Error uploading file: ${error?.message}`);
      throw new Error(`Failed to upload file: ${error?.message}`);
    }
  }

  async copyFile(sourceFileName: string, destFileName: string): Promise<{ fileName: string; url: string }> {
    try {
      await this.minioClient.copyObject(
        this.bucketName,
        destFileName,
        `/${this.bucketName}/${sourceFileName}`,
      );
      const url = await this.createPublicGetUrl(destFileName);
      this.logger.log(`File copied: ${sourceFileName} -> ${destFileName}`);
      return { fileName: destFileName, url };
    } catch (error: any) {
      this.logger.error(`Error copying file: ${error?.message}`);
      throw new Error(`Failed to copy file: ${error?.message}`);
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, fileName);
      this.logger.log(`File deleted successfully: ${fileName}`);
    } catch (error: any) {
      this.logger.error(`Error deleting file: ${error?.message}`);
      throw new Error(`Failed to delete file: ${error?.message}`);
    }
  }

  async getFileUrl(fileName: string): Promise<string> {
    try {
      return await this.createPublicGetUrl(fileName);
    } catch (error: any) {
      this.logger.error(`Error getting file URL: ${error?.message}`);
      throw new Error(`Failed to get file URL: ${error?.message}`);
    }
  }

  async getInternalFileUrl(fileName: string): Promise<string> {
    return this.minioClient.presignedGetObject(
      this.bucketName,
      fileName,
      24 * 60 * 60
    );
  }

  listObjects(): Promise<MinioObjectInfo[]> {
    return new Promise((resolve, reject) => {
      const objects: MinioObjectInfo[] = [];
      const stream = this.minioClient.listObjectsV2(this.bucketName, '', true);

      stream.on('data', (item) => {
        if (!item.name) return;
        objects.push({
          name: item.name,
          size: item.size ?? 0,
          lastModified: item.lastModified,
          etag: item.etag,
        });
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(objects));
    });
  }

  async getObjectStream(objectName: string): Promise<Readable> {
    return this.minioClient.getObject(this.bucketName, objectName);
  }

  async putObject(objectName: string, data: Buffer): Promise<void> {
    await this.minioClient.putObject(this.bucketName, objectName, data, data.length);
  }

  async clearBucket(): Promise<void> {
    const objects = await this.listObjects();
    if (objects.length === 0) return;
    await this.minioClient.removeObjects(this.bucketName, objects.map((item) => item.name));
  }

  private async createPublicGetUrl(fileName: string): Promise<string> {
    return this.publicMinioClient.presignedGetObject(
      this.bucketName,
      fileName,
      24 * 60 * 60
    );
  }

  /**
   * Uploads a sheet music file.
   * - For images (JPG, PNG, TIFF): stores as-is + generates a thumbnail. Returns 1 result.
   * - For PDFs: converts each page to PNG, stores each separately. Returns N results (one per page).
   */
  async uploadSheetMusic(file: UploadedFile): Promise<SheetUploadResult[]> {
    if (file.mimetype === 'application/pdf') {
      return this.uploadPdfAsImages(file);
    }
    return [await this.uploadImageSheet(file.buffer, file.originalname, file.mimetype)];
  }

  private async uploadPdfAsImages(file: UploadedFile): Promise<SheetUploadResult[]> {
    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    let pageBuffers: Buffer[];

    try {
      pageBuffers = await this.convertPdfToImages(file.buffer);
      this.logger.log(`PDF "${file.originalname}" converted to ${pageBuffers.length} page(s)`);
    } catch (error: any) {
      this.logger.error(`PDF conversion failed for "${file.originalname}": ${error?.message}`);
      throw new Error(`Failed to convert PDF to images: ${error?.message}`);
    }

    const results: SheetUploadResult[] = [];
    for (let i = 0; i < pageBuffers.length; i++) {
      const pageName = pageBuffers.length === 1
        ? `${baseName}.png`
        : `${baseName} (${i + 1}).png`;
      results.push(await this.uploadImageSheet(pageBuffers[i], pageName, 'image/png'));
    }
    return results;
  }

  private async uploadImageSheet(
    imageBuffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<SheetUploadResult> {
    const uid = uuidv4();
    const fileName = `sheet-music-${uid}-${originalName}`;

    try {
      await this.minioClient.putObject(
        this.bucketName,
        fileName,
        imageBuffer,
        imageBuffer.length,
        { 'Content-Type': mimeType }
      );

      const url = await this.createPublicGetUrl(fileName);

      this.logger.log(`Sheet uploaded: ${fileName}`);

      // Generate thumbnail
      try {
        const thumbnailBuffer = await sharp(imageBuffer)
          .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside' })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbnailName = `thumb-${uid}.jpg`;
        await this.minioClient.putObject(
          this.bucketName,
          thumbnailName,
          thumbnailBuffer,
          thumbnailBuffer.length,
          { 'Content-Type': 'image/jpeg' }
        );

        const thumbnailUrl = await this.createPublicGetUrl(thumbnailName);

        return { fileName, url, originalName, thumbnailName, thumbnailUrl };
      } catch (thumbError: any) {
        this.logger.warn(`Could not generate thumbnail for ${fileName}: ${thumbError?.message}`);
        return { fileName, url, originalName };
      }
    } catch (error: any) {
      this.logger.error(`Error uploading sheet: ${error?.message}`);
      throw new Error(`Failed to upload sheet: ${error?.message}`);
    }
  }
}
