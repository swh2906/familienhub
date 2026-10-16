// Kopiert die gebaute App (build/) nach pocketbase/pb_public, damit PocketBase sie ausliefert.
import { cp, rm } from 'node:fs/promises';
import { BUILD_DIR, PB_PUBLIC_DIR } from './lib/paths.ts';

await rm(PB_PUBLIC_DIR, { recursive: true, force: true });
await cp(BUILD_DIR, PB_PUBLIC_DIR, { recursive: true });
console.log(`Build nach ${PB_PUBLIC_DIR} kopiert.`);
