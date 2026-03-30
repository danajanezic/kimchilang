// Dependency Graph — tracks cross-module spec hashes for staleness cascade

export class DependencyGraph {
  constructor() {
    this.modules = new Map();
  }

  register(modulePath, info) {
    this.modules.set(modulePath, {
      hash: info.hash,
      depends: info.depends || [],
      depHashes: info.depHashes || {},
    });
  }

  getHash(modulePath) {
    const mod = this.modules.get(modulePath);
    return mod ? mod.hash : null;
  }

  findStaleConsumers(changedModule) {
    const stale = [];
    const currentHash = this.getHash(changedModule);
    for (const [path, info] of this.modules) {
      if (path === changedModule) continue;
      if (!info.depends.includes(changedModule)) continue;
      const recordedHash = info.depHashes[changedModule];
      if (recordedHash && recordedHash !== currentHash) {
        stale.push(path);
      }
    }
    return stale;
  }

  getAllStale() {
    const stale = new Set();
    for (const [path, info] of this.modules) {
      for (const dep of info.depends) {
        const depMod = this.modules.get(dep);
        if (!depMod) continue;
        const recordedHash = info.depHashes[dep];
        if (recordedHash && recordedHash !== depMod.hash) {
          stale.add(path);
        }
      }
    }
    return [...stale];
  }
}
