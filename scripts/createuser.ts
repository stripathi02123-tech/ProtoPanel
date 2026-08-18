import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import readline from "readline";
import { runMigrations, closePool } from "../src/server/services/postgres.js";
import { getAllUsers, saveAllUsers } from "../src/server/repositories/users.js";

async function saveOwnerUser(username: string, password: string): Promise<void> {
  await runMigrations();

  const users = await getAllUsers();
  const existingIndex = users.findIndex((u: any) => u.username?.toLowerCase() === username.toLowerCase());

  const hashedPassword = await bcrypt.hash(password, 10);

  if (existingIndex !== -1) {
    users[existingIndex].password = hashedPassword;
    users[existingIndex].role = "owner";
    users[existingIndex].updatedAt = new Date().toISOString();
    await saveAllUsers(users);
    console.log(`[OK] Owner user '${username}' updated successfully with role 'owner'.`);
  } else {
    users.push({
      id: crypto.randomUUID(),
      username,
      password: hashedPassword,
      role: "owner",
      createdAt: new Date().toISOString(),
    });
    await saveAllUsers(users);
    console.log(`[OK] Owner user '${username}' created successfully with role 'owner'.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  // Check if username and password passed as CLI arguments: npm run createuser admin pass
  if (args.length >= 2) {
    const [username, password] = args;
    await saveOwnerUser(username.trim(), password.trim());
    await closePool();
    process.exit(0);
  }

  console.log("\n========================================");
  console.log("   PROTO PANEL - PRIMARY OWNER SETUP      ");
  console.log("========================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter Owner Username [default: admin]: ", async (rawUser) => {
    const username = (rawUser || "admin").trim();
    rl.question("Enter Owner Password: ", async (rawPass) => {
      const password = rawPass ? rawPass.trim() : "";
      if (!password) {
        console.error("\n[ERROR] Password cannot be empty.");
        rl.close();
        process.exit(1);
      }

      await saveOwnerUser(username, password);
      rl.close();
      await closePool();
      process.exit(0);
    });
  });
}

main().catch(async (err) => {
  console.error("[ERROR]", err);
  await closePool().catch(() => {});
  process.exit(1);
});
