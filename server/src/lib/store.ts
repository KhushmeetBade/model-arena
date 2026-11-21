import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON-file persistence with atomic writes. */
export class JsonStore<T> {
  private file: string;
  constructor(dir: string, name: string, private fallback: () => T) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, name);
  }
  read(): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    } catch {
      return this.fallback();
    }
  }
  write(value: T): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, this.file);
  }
}
