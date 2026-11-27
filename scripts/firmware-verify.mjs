#!/usr/bin/env node
// Verifies a firmware image against a manifest and prints the authorized flash
// plan. It NEVER runs esptool, opens a serial port or writes to a device.
//
// Usage:
//   node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json --image PATH
//   node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json --image PATH --plan
//
// A manifest with appOnly=true is only valid for a device that already has the
// compatible bootloader and partition table. A blank device needs a separate
// initial full installation; this script refuses to present app-only as initial.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestFile = valueOf('--manifest') ?? 'firmware/rc1-manifest.json';
const imageFile = valueOf('--image');
const plan = args.includes('--plan');

if (imageFile === undefined) {
  console.error('--image PATH is required');
  process.exit(2);
}

export function verifyManifest(manifest, imageBytes, sha256) {
  const errors = [];
  if (manifest?.schema !== 1) errors.push('unsupported manifest schema');
  if (typeof manifest?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
    errors.push('manifest sha256 is invalid');
  }
  if (!Number.isInteger(manifest?.size) || manifest.size <= 0) errors.push('manifest size is invalid');
  if (typeof manifest?.flashOffset !== 'string' || !/^0x[0-9a-f]+$/i.test(manifest.flashOffset)) {
    errors.push('manifest flashOffset is invalid');
  }
  if (manifest?.appOnly !== true) errors.push('only an application-only manifest is supported here');
  if (imageBytes.length !== manifest?.size) {
    errors.push(`image size ${imageBytes.length} != manifest ${manifest?.size}`);
  }
  if (sha256 !== manifest?.sha256) errors.push('image sha256 does not match the manifest');
  return errors;
}

try {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const bytes = readFileSync(imageFile);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const errors = verifyManifest(manifest, bytes, sha256);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exit(1);
  }
  console.log(`OK   ${manifest.label ?? manifest.version}`);
  console.log(`sha256=${sha256}`);
  console.log(`size=${bytes.length}`);
  console.log(`offset=${manifest.flashOffset} app_only=${manifest.appOnly}`);
  if (plan) {
    console.log('');
    console.log('FLASH PLAN (requires explicit Product Owner approval; not executed):');
    console.log('  1. stop the bridge and confirm no process owns the serial port');
    console.log('  2. confirm the device identity and current application read-back');
    console.log(`  3. esptool 5.7.0 --no-stub write-flash ${manifest.flashOffset} ${imageFile}`);
    console.log('  4. independent read-back and sha256 comparison');
    console.log(`  5. rollback target ${manifest.rollback?.sha256 ?? 'not specified'} (${manifest.rollback?.size ?? '?'} B)`);
    console.log('');
    console.log('A blank ESP32-C3 is NOT covered by an application-only image: install the');
    console.log('bootloader/partition layout with a separately approved initial full image.');
  }
} catch (error) {
  console.error(`firmware verification failed: ${error.message}`);
  process.exit(2);
}
