import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG, parseConfig } from '../src/config.js';
import { DeviceDiscovery, type SerialPortInfoLike } from '../src/device/discovery.js';
import { TransportError } from '../src/transport/types.js';

// The port list is mocked; no serial port is opened. This is AUTOMATED, not a
// hardware discovery test.

function discovery(ports: SerialPortInfoLike[]): DeviceDiscovery {
  return new DeviceDiscovery(async () => ports);
}

test('only Espressif 303a:1001 candidates are considered', async () => {
  const found = await discovery([
    { path: '/dev/ttyACM0', vendorId: '303A', productId: '1001', serialNumber: 'AA' },
    { path: '/dev/ttyUSB0', vendorId: '0403', productId: '6001' },
    { path: 'COM7', vendorId: '0x303a', productId: '0x1001', serialNumber: 'BB' },
  ]).list();
  assert.deepEqual(found.map((entry) => entry.path), ['/dev/ttyACM0', 'COM7']);
  assert.deepEqual(found.map((entry) => entry.vendorId), ['303a', '303a']);
});

test('a single candidate is selected automatically', async () => {
  const selected = await discovery([
    { path: 'COM7', vendorId: '303a', productId: '1001', serialNumber: 'AA' },
  ]).select(parseConfig({}));
  assert.equal(selected.path, 'COM7');
  assert.equal(selected.serialNumber, 'AA');
});

test('multiple candidates require an explicit serial or port', async () => {
  const ports = [
    { path: 'COM8', vendorId: '303a', productId: '1001', serialNumber: 'BB' },
    { path: 'COM7', vendorId: '303a', productId: '1001', serialNumber: 'AA' },
  ];
  await assert.rejects(
    () => discovery(ports).select(parseConfig({})),
    (error: unknown) => error instanceof TransportError && /multiple Espressif/.test(error.message),
  );
  const selected = await discovery(ports).select(parseConfig({ deviceSerial: 'bb' }));
  assert.equal(selected.path, 'COM8');
});

test('an explicit port always wins and is not opened during discovery', async () => {
  let listed = false;
  const instance = new DeviceDiscovery(async () => {
    listed = true;
    return [];
  });
  const selected = await instance.select(parseConfig({ port: '/dev/ttyACM9' }));
  assert.equal(selected.path, '/dev/ttyACM9');
  assert.equal(listed, false);
});

test('a missing configured serial lists the deterministic candidates', async () => {
  const ports = [
    { path: 'COM8', vendorId: '303a', productId: '1001', serialNumber: 'BB' },
    { path: 'COM7', vendorId: '303a', productId: '1001', serialNumber: 'AA' },
  ];
  await assert.rejects(
    () => discovery(ports).select(parseConfig({ deviceSerial: 'CC' })),
    /configured device serial not found.*AA @ COM7.*BB @ COM8/,
  );
});

test('no device and autoDetect disabled are explicit errors', async () => {
  await assert.rejects(() => discovery([]).select(parseConfig({})), /no Espressif/);
  await assert.rejects(
    () => discovery([]).select(parseConfig({ autoDetect: false })),
    /no serial port configured/,
  );
  assert.equal(DEFAULT_CONFIG.deviceSerial, null);
});
