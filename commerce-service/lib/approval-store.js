import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class ApprovalStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async mutate(update) {
    const operation = this.queue.then(async () => {
      const items = await this.read();
      const result = update(items);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(items, null, 2));
      await rename(temp, this.filePath);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  create(data) {
    return this.mutate((items) => {
      const item = {
        id: randomUUID(), status: "pending", createdAt: new Date().toISOString(),
        reviewedAt: null, reviewerNote: "", ...data
      };
      items.push(item);
      return item;
    });
  }

  update(id, status, reviewerNote = "") {
    return this.mutate((items) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return null;
      item.status = status;
      item.reviewerNote = reviewerNote;
      item.reviewedAt = new Date().toISOString();
      return item;
    });
  }
}
