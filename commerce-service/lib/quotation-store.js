import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class QuotationStore {
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

  mutate(update) {
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
        id: `REQ-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: "pending",
        stage: "submitted",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stageHistory: [{ stage: "submitted", at: new Date().toISOString() }],
        reviewedAt: null,
        reviewerNote: "",
        quotation: null,
        notification: { admin: "pending", customer: "not_sent", error: "" },
        ...data
      };
      items.push(item);
      return item;
    });
  }

  update(id, changes) {
    return this.mutate((items) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return null;
      const now = new Date().toISOString();
      if (changes.stage && changes.stage !== item.stage) {
        item.stageHistory ||= [{ stage: item.stage || "submitted", at: item.createdAt }];
        item.stageHistory.push({ stage: changes.stage, at: now });
      }
      Object.assign(item, changes, { reviewedAt: now, updatedAt: now });
      return item;
    });
  }

  setNotification(id, recipient, status, error = "") {
    return this.mutate((items) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return null;
      item.notification = { ...item.notification, [recipient]: status, error };
      return item;
    });
  }
}
