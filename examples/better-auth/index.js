import { createServer } from "node:http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import betterAuthStorage from "polystore/better-auth";

const auth = betterAuth({
  secret: "your-secret-here",
  secondaryStorage: betterAuthStorage(new Map()),  // swap new Map() for Redis, SQLite, etc.
  emailAndPassword: { enabled: true },
});

createServer(toNodeHandler(auth)).listen(3000, () => console.log("http://localhost:3000/api/auth"));
