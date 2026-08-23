import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getTestFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getTestFiles(fullPath));
    } else if (file.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

const testFiles = getTestFiles(path.join(process.cwd(), 'tests'));
console.log(`\n🚀 Executing ${testFiles.length} test suites with dedicated process isolation...\n`);

let totalPassed = 0;
let totalFailed = 0;

// Resolve tsx entrypoint safely
const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

for (const file of testFiles) {
  const relPath = path.relative(process.cwd(), file);
  console.log(`----------------------------------------------------------------`);
  console.log(`📋 Running: ${relPath}`);
  console.log(`----------------------------------------------------------------`);

  const result = spawnSync(process.execPath, [tsxCli, file], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', CI: 'true' }
  });

  if (result.status === 0) {
    totalPassed++;
  } else {
    totalFailed++;
    console.error(`\n❌ FAILED: ${relPath} (exit code ${result.status})\n`);
  }
}

console.log(`\n================================================================`);
console.log(`📊 Test Summary: ${totalPassed} passed, ${totalFailed} failed out of ${testFiles.length} suites.`);
console.log(`================================================================\n`);

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
