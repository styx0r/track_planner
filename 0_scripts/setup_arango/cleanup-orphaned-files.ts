import { Database } from 'arangojs';
import { Client as MinioClient } from 'minio';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface MusicDocument {
  file_name: string;
  sheet_music_name?: string;
}

async function cleanupOrphanedFiles() {
  console.log('🧹 Starting cleanup of orphaned files...\n');

  // Connect to ArangoDB
  const db = new Database({
    url: process.env.ARANGO_URL || 'http://localhost:8529',
    databaseName: process.env.ARANGO_DATABASE || 'track-planner',
    auth: {
      username: process.env.ARANGO_USER || 'track-planner',
      password: process.env.ARANGO_PASSWORD || 'track-planner',
    },
  });

  // Connect to MinIO
  const minioClient = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  const bucketName = process.env.MINIO_BUCKET_NAME || 'music-files';

  try {
    // Get all file names from database
    console.log('📊 Fetching all files from database...');
    const cursor = await db.query('FOR doc IN music RETURN doc');
    const documents: MusicDocument[] = await cursor.all();

    const dbFileNames = new Set<string>();
    documents.forEach((doc) => {
      if (doc.file_name) dbFileNames.add(doc.file_name);
      if (doc.sheet_music_name) dbFileNames.add(doc.sheet_music_name);
    });

    console.log(`✅ Found ${dbFileNames.size} files referenced in database\n`);

    // Get all files from MinIO
    console.log('🗄️  Fetching all files from MinIO...');
    const minioFiles: string[] = [];

    const stream = minioClient.listObjectsV2(bucketName, '', true);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) minioFiles.push(obj.name);
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    console.log(`✅ Found ${minioFiles.length} files in MinIO\n`);

    // Find orphaned files
    const orphanedFiles = minioFiles.filter(
      (fileName) => !dbFileNames.has(fileName)
    );

    if (orphanedFiles.length === 0) {
      console.log('✨ No orphaned files found! Everything is clean.\n');
      return;
    }

    console.log(`⚠️  Found ${orphanedFiles.length} orphaned files:\n`);
    orphanedFiles.forEach((file) => console.log(`   - ${file}`));
    console.log();

    // Delete orphaned files
    console.log('🗑️  Deleting orphaned files...\n');
    let deletedCount = 0;

    for (const fileName of orphanedFiles) {
      try {
        await minioClient.removeObject(bucketName, fileName);
        console.log(`   ✓ Deleted: ${fileName}`);
        deletedCount++;
      } catch (error: any) {
        console.error(`   ✗ Failed to delete ${fileName}: ${error.message}`);
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} orphaned files.`);
  } catch (error: any) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run the cleanup
cleanupOrphanedFiles()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
