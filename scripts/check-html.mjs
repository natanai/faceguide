import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

async function collectHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'scripts'].includes(entry.name)) {
        continue;
      }
      files.push(...await collectHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeToProject(filePath) {
  return path.relative(path.resolve(__dirname, '..'), filePath);
}

async function main() {
  const htmlFiles = await collectHtmlFiles(projectDir);
  if (htmlFiles.length === 0) {
    console.error('No HTML files found to validate.');
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const requiredSnippets = new Map([
    ['index.html', ['id="overlayCanvas"', 'pendingImages']],
    ['manual.html', ['scheduleStorageImage', 'storageStatus']]
  ]);

  for (const file of htmlFiles) {
    const contents = await fs.readFile(file, 'utf8');
    const relPath = relativeToProject(file);

    if (!/<!DOCTYPE html>/i.test(contents)) {
      errors.push(`${relPath}: missing <!DOCTYPE html>`);
    }
    if (!contents.toLowerCase().includes('</html>')) {
      errors.push(`${relPath}: missing closing </html> tag`);
    }

    const fileName = path.basename(file);
    const snippets = requiredSnippets.get(fileName);
    if (snippets) {
      for (const snippet of snippets) {
        if (!contents.includes(snippet)) {
          errors.push(`${relPath}: expected to contain "${snippet}"`);
        }
      }
    }
  }

  if (errors.length) {
    console.error('HTML checks failed:\n' + errors.map(err => ` - ${err}`).join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${htmlFiles.length} HTML file(s).`);
}

main().catch(err => {
  console.error('HTML check failed with error:', err);
  process.exitCode = 1;
});
