import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultData, DATA_FILES } from './config.js';

export class JsonStore {
  constructor(directory = process.env.DATA_DIR || './data') {
    this.directory = path.resolve(directory);
    this.defaults = defaultData();
    this.locks = new Map();
  }

  async init() {
    await mkdir(this.directory, { recursive: true });
    for (const file of DATA_FILES) {
      const location = this.resolve(file);
      try {
        await readFile(location);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await this.write(file, this.defaults[file]);
      }
    }
  }

  resolve(file) {
    if (!DATA_FILES.includes(file)) throw new Error(`Unsupported data file: ${file}`);
    return path.join(this.directory, file);
  }

  async read(file) {
    const raw = await readFile(this.resolve(file), 'utf8');
    return JSON.parse(raw);
  }

  async write(file, value) {
    return this.withLock(file, async () => {
      const location = this.resolve(file);
      const temporary = `${location}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, location);
    });
  }

  async append(file, value) {
    return this.withLock(file, async () => {
      const current = await this.read(file);
      if (!Array.isArray(current)) throw new TypeError(`${file} is not an array`);
      current.push(value);
      const location = this.resolve(file);
      const temporary = `${location}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, location);
      return value;
    });
  }

  async update(file, predicate, mutate) {
    return this.withLock(file, async () => {
      const current = await this.read(file);
      if (!Array.isArray(current)) throw new TypeError(`${file} is not an array`);
      const target = current.find(predicate);
      if (!target) return null;
      const updated = mutate(target) ?? target;
      const index = current.indexOf(target);
      current[index] = updated;
      const location = this.resolve(file);
      const temporary = `${location}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, location);
      return updated;
    });
  }

  async withLock(file, operation) {
    const previous = this.locks.get(file) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(file, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(file) === queued) this.locks.delete(file);
    }
  }
}
