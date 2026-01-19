// KimchiLang Package Manager
// Handles fetching and managing external dependencies from GitHub

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { execSync } from 'child_process';
import { parseStaticFile } from './static-parser.js';

const DEPS_DIR = '.km_modules';
const LOCK_FILE = '.km_modules/.lock.json';

/**
 * Parse project.static and extract dependencies
 */
export function parseProjectFile(projectPath = '.') {
  const projectFile = resolve(projectPath, 'project.static');
  
  if (!existsSync(projectFile)) {
    return null;
  }
  
  const source = readFileSync(projectFile, 'utf-8');
  const declarations = parseStaticFile(source, 'project');
  
  return declarations;
}

/**
 * Extract dependency URLs from project declarations
 */
export function getDependencies(declarations) {
  if (!declarations || !declarations.depend) {
    return [];
  }
  
  const depend = declarations.depend;
  
  if (depend.type !== 'array') {
    throw new Error('depend must be an array of GitHub URLs');
  }
  
  return depend.values.map(v => {
    if (v.type !== 'literal' || typeof v.value !== 'string') {
      throw new Error('Each dependency must be a string URL');
    }
    return v.value;
  });
}

/**
 * Parse a GitHub URL into owner, repo, and optional path/ref
 * Supports formats:
 *   - github.com/owner/repo
 *   - github.com/owner/repo/path/to/module
 *   - github.com/owner/repo@tag
 *   - github.com/owner/repo/path@tag
 */
export function parseGitHubUrl(url) {
  // Remove protocol if present
  let cleanUrl = url.replace(/^https?:\/\//, '');
  
  // Must start with github.com
  if (!cleanUrl.startsWith('github.com/')) {
    throw new Error(`Invalid GitHub URL: ${url}. Must start with github.com/`);
  }
  
  cleanUrl = cleanUrl.replace('github.com/', '');
  
  // Check for @ref
  let ref = 'main';
  if (cleanUrl.includes('@')) {
    const [pathPart, refPart] = cleanUrl.split('@');
    cleanUrl = pathPart;
    ref = refPart;
  }
  
  const parts = cleanUrl.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub URL: ${url}. Must include owner/repo`);
  }
  
  const owner = parts[0];
  const repo = parts[1];
  const subpath = parts.slice(2).join('/') || '';
  
  return { owner, repo, subpath, ref };
}

/**
 * Generate a unique directory name for a dependency
 */
export function getDependencyDirName(owner, repo, ref) {
  const safeName = `${owner}_${repo}`;
  if (ref && ref !== 'main' && ref !== 'master') {
    return `${safeName}_${ref.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
  return safeName;
}

/**
 * Fetch a dependency from GitHub
 */
export function fetchDependency(url, projectPath = '.') {
  const { owner, repo, subpath, ref } = parseGitHubUrl(url);
  const depsDir = resolve(projectPath, DEPS_DIR);
  const dirName = getDependencyDirName(owner, repo, ref);
  const targetDir = join(depsDir, dirName);
  
  // Create deps directory if needed
  if (!existsSync(depsDir)) {
    mkdirSync(depsDir, { recursive: true });
  }
  
  // Check if already exists
  if (existsSync(targetDir)) {
    console.log(`  ✓ ${owner}/${repo} already installed`);
    return { dirName, targetDir, subpath };
  }
  
  console.log(`  ↓ Fetching ${owner}/${repo}@${ref}...`);
  
  // Clone the repository
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  
  try {
    execSync(`git clone --depth 1 --branch ${ref} ${cloneUrl} ${targetDir}`, {
      stdio: 'pipe',
      cwd: projectPath,
    });
    
    // Remove .git directory to save space
    const gitDir = join(targetDir, '.git');
    if (existsSync(gitDir)) {
      rmSync(gitDir, { recursive: true, force: true });
    }
    
    console.log(`  ✓ Installed ${owner}/${repo}`);
  } catch (error) {
    // Try without branch (might be a tag)
    try {
      execSync(`git clone --depth 1 ${cloneUrl} ${targetDir}`, {
        stdio: 'pipe',
        cwd: projectPath,
      });
      
      // Checkout the specific ref
      execSync(`git checkout ${ref}`, {
        stdio: 'pipe',
        cwd: targetDir,
      });
      
      // Remove .git directory
      const gitDir = join(targetDir, '.git');
      if (existsSync(gitDir)) {
        rmSync(gitDir, { recursive: true, force: true });
      }
      
      console.log(`  ✓ Installed ${owner}/${repo}@${ref}`);
    } catch (innerError) {
      throw new Error(`Failed to fetch ${url}: ${innerError.message}`);
    }
  }
  
  return { dirName, targetDir, subpath };
}

/**
 * Install all dependencies from project.static
 */
export function installDependencies(projectPath = '.') {
  const declarations = parseProjectFile(projectPath);
  
  if (!declarations) {
    console.log('No project.static found');
    return [];
  }
  
  const deps = getDependencies(declarations);
  
  if (deps.length === 0) {
    console.log('No dependencies declared');
    return [];
  }
  
  console.log(`Installing ${deps.length} dependencies...\n`);
  
  const installed = [];
  
  for (const url of deps) {
    try {
      const result = fetchDependency(url, projectPath);
      installed.push({ url, ...result });
    } catch (error) {
      console.error(`  ✗ Failed to install ${url}: ${error.message}`);
    }
  }
  
  // Write lock file
  writeLockFile(projectPath, installed);
  
  console.log(`\nInstalled ${installed.length}/${deps.length} dependencies`);
  
  return installed;
}

/**
 * Write lock file with installed dependency info
 */
export function writeLockFile(projectPath, installed) {
  const lockPath = resolve(projectPath, LOCK_FILE);
  const lockDir = dirname(lockPath);
  
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }
  
  const lockData = {
    version: 1,
    installedAt: new Date().toISOString(),
    dependencies: installed.map(dep => ({
      url: dep.url,
      dirName: dep.dirName,
      subpath: dep.subpath,
    })),
  };
  
  writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
}

/**
 * Read lock file
 */
export function readLockFile(projectPath = '.') {
  const lockPath = resolve(projectPath, LOCK_FILE);
  
  if (!existsSync(lockPath)) {
    return null;
  }
  
  return JSON.parse(readFileSync(lockPath, 'utf-8'));
}

/**
 * Resolve a module path to check if it's an external dependency
 * Returns the file path if found in deps, null otherwise
 */
export function resolveExternalModule(modulePath, projectPath = '.') {
  const lockData = readLockFile(projectPath);
  
  if (!lockData || !lockData.dependencies) {
    return null;
  }
  
  const depsDir = resolve(projectPath, DEPS_DIR);
  
  // Check each installed dependency
  for (const dep of lockData.dependencies) {
    const depDir = join(depsDir, dep.dirName);
    
    // If subpath is specified, check if module path starts with a matching pattern
    if (dep.subpath) {
      // The module might be referenced by the subpath name
      const subpathName = basename(dep.subpath);
      if (modulePath.startsWith(subpathName + '.') || modulePath === subpathName) {
        const relativePath = modulePath.replace(subpathName, '').replace(/^\./, '');
        const fullPath = join(depDir, dep.subpath, relativePath.replace(/\./g, '/'));
        
        // Try various extensions
        for (const ext of ['.km', '.kimchi', '.kc', '/index.km', '/index.kimchi', '/index.kc']) {
          const tryPath = fullPath + ext;
          if (existsSync(tryPath)) {
            return tryPath;
          }
        }
      }
    }
    
    // Try matching by repo name
    const repoName = dep.dirName.split('_')[1] || dep.dirName;
    if (modulePath.startsWith(repoName + '.') || modulePath === repoName) {
      const relativePath = modulePath.replace(repoName, '').replace(/^\./, '');
      const fullPath = join(depDir, relativePath.replace(/\./g, '/'));
      
      // Try various extensions
      for (const ext of ['.km', '.kimchi', '.kc', '/index.km', '/index.kimchi', '/index.kc']) {
        const tryPath = fullPath + ext;
        if (existsSync(tryPath)) {
          return tryPath;
        }
      }
    }
  }
  
  return null;
}

/**
 * Clean installed dependencies
 */
export function cleanDependencies(projectPath = '.') {
  const depsDir = resolve(projectPath, DEPS_DIR);
  
  if (existsSync(depsDir)) {
    rmSync(depsDir, { recursive: true, force: true });
    console.log('Removed .km_modules');
  }
}
