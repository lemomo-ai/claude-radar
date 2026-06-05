#!/usr/bin/env node
// list-projects.mjs — scan ~/.claude/projects/ + optional cwd matching
// Usage: node list-projects.mjs [--cwd <absolute-path>]
// Output (stdout): { projectsDir, count, projects: [...], cwdMatch: {...}|null }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

try {
  const claudeRadarHome = path.join(os.homedir(), '.claude-radar');
  fs.mkdirSync(path.join(claudeRadarHome, 'temp'), { recursive: true });
  fs.mkdirSync(path.join(claudeRadarHome, 'reports'), { recursive: true });
} catch {}

const args = process.argv.slice(2);
let cwdArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cwd' && args[i + 1]) { cwdArg = args[i + 1]; i++; }
}

const projectsDir = path.join(os.homedir(), '.claude', 'projects');

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

if (!fs.existsSync(projectsDir)) {
  emit({
    projectsDir,
    count: 0,
    projects: [],
    cwdMatch: null,
    error: `projects directory not found: ${projectsDir}`
  });
  process.exit(0);
}

function deriveDisplayName(slug) {
  const parts = slug.split('-').filter(Boolean);
  if (parts.length === 0) return slug;
  return parts[parts.length - 1];
}

// Encode an absolute path into the slug format Claude Code uses for ~/.claude/projects/<slug>.
// Spaces are replaced with -, all / → -. Note: this is lossy (cannot distinguish - in dir name).
function encodeCwdToSlug(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  return cwd.replace(/[\/ ]/g, '-');
}

const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
const projects = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const projectPath = path.join(projectsDir, entry.name);
  let sessionCount = 0;
  let lastModified = 0;

  try {
    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      sessionCount++;
      try {
        const stat = fs.statSync(path.join(projectPath, file));
        if (stat.mtimeMs > lastModified) lastModified = stat.mtimeMs;
      } catch {}
    }
  } catch { continue; }

  if (sessionCount === 0) continue;

  projects.push({
    slug: entry.name,
    displayName: deriveDisplayName(entry.name),
    path: projectPath,
    sessionCount,
    lastModified: new Date(lastModified).toISOString()
  });
}

projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

let cwdMatch = null;
if (cwdArg) {
  const targetSlug = encodeCwdToSlug(cwdArg);
  if (targetSlug) {
    const exact = projects.find(p => p.slug === targetSlug);
    if (exact) {
      cwdMatch = { ...exact, matchType: 'exact' };
    } else {
      // Try suffix match — handles cases where cwd has dashes in dir names
      const lastSeg = path.basename(cwdArg);
      const candidates = projects.filter(p => p.slug.endsWith('-' + lastSeg.replace(/ /g, '-')));
      if (candidates.length === 1) cwdMatch = { ...candidates[0], matchType: 'suffix' };
    }
    // Parent-directory walk-up — Claude Code may have been launched from a parent dir.
    // Walk up until we find a slug that exists. Skip filesystem root.
    if (!cwdMatch) {
      let cursor = cwdArg;
      while (true) {
        const parent = path.dirname(cursor);
        if (!parent || parent === cursor) break;
        const parentSlug = encodeCwdToSlug(parent);
        if (!parentSlug) break;
        const match = projects.find(p => p.slug === parentSlug);
        if (match) {
          cwdMatch = { ...match, matchType: 'parent', parentPath: parent };
          break;
        }
        cursor = parent;
      }
    }
  }
}

emit({ projectsDir, count: projects.length, projects, cwdMatch });
