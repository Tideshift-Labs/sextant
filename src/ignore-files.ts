import { existsSync, readFileSync, appendFileSync } from 'fs';
import path from 'path';

const SEXTANT_ENTRY = '.sextant/';
const IGNORE_FILES = ['.gitignore', '.dvignore', '.p4ignore', '.hgignore'];

/**
 * For each known ignore file that exists in the project root,
 * append `.sextant/` if it isn't already listed.
 */
export function ensureIgnored(projectRoot: string): void {
  for (const file of IGNORE_FILES) {
    const filePath = path.join(projectRoot, file);
    if (!existsSync(filePath)) continue;

    try {
      const content = readFileSync(filePath, 'utf-8');
      // Check if already ignored (exact line match)
      const lines = content.split(/\r?\n/);
      if (lines.some((line) => line.trim() === SEXTANT_ENTRY || line.trim() === '.sextant')) {
        continue;
      }

      const suffix = content.endsWith('\n') ? '' : '\n';
      appendFileSync(filePath, `${suffix}${SEXTANT_ENTRY}\n`);
      console.error(`[ignore] Added ${SEXTANT_ENTRY} to ${file}`);
    } catch (err) {
      console.error(`[ignore] Could not update ${file}:`, err);
    }
  }
}
