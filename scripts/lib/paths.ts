// Gemeinsame Pfade für alle Skripte, plattformneutral über node:path.
import path from 'node:path';
import { pbBinaryName } from './pocketbase.ts';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const PB_DIR = path.join(ROOT, 'pocketbase');
export const PB_BIN_DIR = path.join(PB_DIR, 'bin');
export const PB_BINARY = path.join(PB_BIN_DIR, pbBinaryName(process.platform));
export const PB_VERSION_FILE = path.join(PB_DIR, 'VERSION');
export const PB_PUBLIC_DIR = path.join(PB_DIR, 'pb_public');
export const BUILD_DIR = path.join(ROOT, 'build');
export const PB_PORT = 8090;
