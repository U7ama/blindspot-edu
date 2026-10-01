import { cp, mkdir, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL(".next/standalone/", root);
try {
  await access(new URL("server.js", output));
} catch {
  throw new Error("Standalone build is missing. Run npm run build before npm start.");
}
await mkdir(new URL(".next/", output), { recursive: true });
for (const name of ["public", ".next/static"]) {
  await rm(new URL(name, output), { recursive: true, force: true });
  await cp(fileURLToPath(new URL(name, root)), fileURLToPath(new URL(name, output)), { recursive: true });
}
