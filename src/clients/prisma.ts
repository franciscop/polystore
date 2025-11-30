import Client from "./Client.js";

// Use a Prisma table model with 'id', 'value', and optionally 'expiresAt' columns
// Pass the table directly: kv(prisma.store)
export default class Prisma extends Client {
  // Indicate that this client handles expirations
  EXPIRES = true;

  // Check if this is the right class for the given client (Prisma model delegate)
  static test = (client: any): boolean =>
    client && client.findUnique && client.upsert && client.findMany;

  get = async (id: string): Promise<any> => {
    const record = await this.client.findUnique({ where: { id } });
    if (!record) return null;
    // Check if expired
    if (record.expiresAt && record.expiresAt < new Date()) {
      await this.del(id);
      return null;
    }
    return this.decode(record.value);
  };

  set = async (id: string, data: any, { expires }: { expires?: number | null } = {}): Promise<void> => {
    const value = this.encode(data);
    const expiresAt = expires ? new Date(Date.now() + expires * 1000) : null;
    await this.client.upsert({
      where: { id },
      update: { value, expiresAt },
      create: { id, value, expiresAt },
    });
  };

  del = async (id: string): Promise<void> => {
    try {
      await this.client.delete({ where: { id } });
    } catch (error: any) {
      // Ignore if record doesn't exist
      if (error.code !== "P2025") throw error;
    }
  };

  has = async (id: string): Promise<boolean> => {
    const record = await this.client.findUnique({
      where: { id },
      select: { id: true, expiresAt: true },
    });
    if (!record) return false;
    // Check if expired
    if (record.expiresAt && record.expiresAt < new Date()) {
      await this.del(id);
      return false;
    }
    return true;
  };

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const now = new Date();
    const records = await this.client.findMany({
      where: {
        id: { startsWith: prefix },
      },
    });
    for (const record of records) {
      // Skip expired records
      if (record.expiresAt && record.expiresAt < now) continue;
      yield [record.id, this.decode(record.value)];
    }
  }

  keys = async (prefix = ""): Promise<string[]> => {
    const now = new Date();
    const records = await this.client.findMany({
      where: {
        id: { startsWith: prefix },
      },
      select: { id: true, expiresAt: true },
    });
    return records
      .filter((r: any) => !r.expiresAt || r.expiresAt >= now)
      .map((r: any) => r.id);
  };

  entries = async (prefix = ""): Promise<[string, any][]> => {
    const now = new Date();
    const records = await this.client.findMany({
      where: {
        id: { startsWith: prefix },
      },
    });
    return records
      .filter((r: any) => !r.expiresAt || r.expiresAt >= now)
      .map((r: any) => [r.id, this.decode(r.value)]);
  };

  clearAll = async (): Promise<void> => {
    await this.client.deleteMany({});
  };
}
