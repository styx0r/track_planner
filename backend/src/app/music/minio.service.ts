import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { v4 as uuidv4 } from 'uuid';

// Minimal file type to avoid depending on Express types
interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: MinioClient;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.minioClient = new MinioClient({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000')),
      useSSL:
        this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>(
        'MINIO_ACCESS_KEY',
        'minioadmin'
      ),
      secretKey: this.configService.get<string>(
        'MINIO_SECRET_KEY',
        'minioadmin'
      ),
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
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Created bucket: ${this.bucketName}`);
      }
    } catch (error: any) {
      this.logger.error(`Error ensuring bucket exists: ${error?.message}`);
    }
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
        {
          'Content-Type': file.mimetype,
        }
      );

      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        fileName,
        24 * 60 * 60 // 24 hours
      );

      this.logger.log(`File uploaded successfully: ${fileName}`);
      return { fileName, url };
    } catch (error: any) {
      this.logger.error(`Error uploading file: ${error?.message}`);
      throw new Error(`Failed to upload file: ${error?.message}`);
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
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        fileName,
        24 * 60 * 60 // 24 hours
      );
    } catch (error: any) {
      this.logger.error(`Error getting file URL: ${error?.message}`);
      throw new Error(`Failed to get file URL: ${error?.message}`);
    }
  }

  async uploadSheetMusic(
    file: UploadedFile
  ): Promise<{ fileName: string; url: string }> {
    const fileName = `sheet-music-${uuidv4()}-${file.originalname}`;

    try {
      await this.minioClient.putObject(
        this.bucketName,
        fileName,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
        }
      );

      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        fileName,
        24 * 60 * 60 // 24 hours
      );

      this.logger.log(`Sheet music uploaded successfully: ${fileName}`);
      return { fileName, url };
    } catch (error: any) {
      this.logger.error(`Error uploading sheet music: ${error?.message}`);
      throw new Error(`Failed to upload sheet music: ${error?.message}`);
    }
  }
}
