import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, '..');
const outDir = path.resolve(__dirname, '..', 'dist');

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'scripts'].includes(entry.name)) {
        continue;
      }
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      if (['package.json', 'package-lock.json', '.gitignore'].includes(entry.name)) {
        continue;
      }
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await copyDir(sourceDir, outDir);
  console.log(`Copied static files from ${sourceDir} to ${outDir}`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});
