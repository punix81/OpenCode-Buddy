import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';

import { validateLine, validateMessage } from '../src/protocol/validator.js';

const root = join(process.cwd(), '..');
const schemaPath = join(root, 'protocol', 'schemas', 'protocol-v1.schema.json');
const examplesDir = join(root, 'protocol', 'examples');
const vectorsPath = join(root, 'protocol', 'test-vectors', 'messages.json');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

let failures = 0;

function fail(message: string): void {
  ++failures;
  console.error(`FAIL ${message}`);
}

for (const file of readdirSync(examplesDir).filter((name) => name.endsWith('.json'))) {
  const path = join(examplesDir, file);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const schemaOk = validate(value);
  const runtime = validateMessage(value);
  if (!schemaOk) {
    fail(`${file} schema: ${ajv.errorsText(validate.errors)}`);
  }
  if (!runtime.ok) {
    fail(`${file} runtime: ${runtime.code} ${runtime.detail}`);
  }
}

interface Vectors {
  valid: { name: string; message: unknown }[];
  invalid: { name: string; message?: unknown; line?: string; error: string }[];
}
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as Vectors;

for (const item of vectors.valid) {
  if (!validate(item.message)) {
    fail(`vector ${item.name} schema: ${ajv.errorsText(validate.errors)}`);
  }
  const runtime = validateMessage(item.message);
  if (!runtime.ok) {
    fail(`vector ${item.name} runtime: ${runtime.code}`);
  }
}

for (const item of vectors.invalid) {
  if (item.message !== undefined) {
    if (validate(item.message)) {
      fail(`invalid vector ${item.name} unexpectedly passed the schema`);
    }
    const runtime = validateMessage(item.message);
    if (runtime.ok) {
      fail(`invalid vector ${item.name} unexpectedly passed validation`);
    } else if (runtime.code !== item.error) {
      fail(`invalid vector ${item.name} code=${runtime.code} expected=${item.error}`);
    }
  } else if (item.line !== undefined) {
    const runtime = validateLine(item.line);
    if (runtime.ok) {
      fail(`invalid line ${item.name} unexpectedly passed`);
    } else if (runtime.code !== item.error) {
      fail(`invalid line ${item.name} code=${runtime.code} expected=${item.error}`);
    }
  }
}

console.log(`protocol validation: ${failures === 0 ? 'PASS' : 'FAIL'} (${vectors.valid.length} valid, ${vectors.invalid.length} invalid, examples verified)`);
process.exit(failures === 0 ? 0 : 1);
