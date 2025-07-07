#!/usr/bin/env node

/**
 * Migration script to rename "urls" directory to "jobs"
 * and maintain existing download job data
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.join(__dirname, '..');
const OLD_URLS_DIR = path.join(BASE_DIR, 'data', 'urls');
const NEW_JOBS_DIR = path.join(BASE_DIR, 'data', 'jobs');

async function ensureDirectoryExists(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function copyDirectory(src, dest) {
  await ensureDirectoryExists(dest);

  try {
    const items = await fs.readdir(src);

    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);

      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
        console.log(`Copied: ${srcPath} -> ${destPath}`);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Source directory ${src} does not exist, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log(
    '🚀 Starting migration from "urls" to "jobs" directory structure...'
  );

  try {
    // Check if old directory exists
    try {
      await fs.access(OLD_URLS_DIR);
      console.log('✅ Found existing "urls" directory');
    } catch {
      console.log(
        'ℹ️  No existing "urls" directory found - migration not needed'
      );
      return;
    }

    // Check if new directory already exists
    try {
      await fs.access(NEW_JOBS_DIR);
      console.log('⚠️  "jobs" directory already exists');

      // Ask user what to do (in a real scenario, you might want interactive prompts)
      console.log('   Proceeding with backup and migration...');

      // Create backup of existing jobs directory
      const backupDir = path.join(
        BASE_DIR,
        'data',
        `jobs-backup-${Date.now()}`
      );
      await copyDirectory(NEW_JOBS_DIR, backupDir);
      console.log(`📦 Created backup at: ${backupDir}`);
    } catch {
      console.log('✅ "jobs" directory does not exist - safe to proceed');
    }

    // Copy urls directory structure to jobs
    console.log('📁 Copying directory structure...');
    await copyDirectory(OLD_URLS_DIR, NEW_JOBS_DIR);

    // Verify the copy was successful
    const subDirs = ['queued', 'active', 'finished'];
    for (const subDir of subDirs) {
      const newSubDir = path.join(NEW_JOBS_DIR, subDir);
      try {
        await fs.access(newSubDir);
        console.log(`✅ Verified: ${subDir} directory copied successfully`);
      } catch {
        console.log(`⚠️  Warning: ${subDir} directory was not copied`);
      }
    }

    // Count files migrated
    let totalFiles = 0;
    for (const subDir of subDirs) {
      try {
        const files = await fs.readdir(path.join(NEW_JOBS_DIR, subDir));
        const jsonFiles = files.filter((f) => f.endsWith('.json'));
        totalFiles += jsonFiles.length;
        console.log(`📄 ${subDir}: ${jsonFiles.length} download jobs migrated`);
      } catch {
        // Directory might not exist, which is fine
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   • Total download jobs migrated: ${totalFiles}`);
    console.log(`   • Old location: ${OLD_URLS_DIR}`);
    console.log(`   • New location: ${NEW_JOBS_DIR}`);

    // Remove old directory (optional - commented out for safety)
    // console.log('\n🗑️  Removing old "urls" directory...');
    // await fs.rm(OLD_URLS_DIR, { recursive: true, force: true });

    console.log('\n✨ Migration completed successfully!');
    console.log(
      '📝 Note: Old "urls" directory has been left intact for safety.'
    );
    console.log(
      '   You can manually remove it after verifying the migration worked correctly.'
    );
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main().catch(console.error);
