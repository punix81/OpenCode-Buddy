import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BridgeConfig } from '../config.js';
import { pipeHostPath } from '../ipc/windows-pipe.js';
import { TransportError } from '../transport/types.js';

export interface DeviceCandidate {
  path: string;
  vendorId: string;
  productId: string;
  serialNumber?: string;
}

const execFileAsync = promisify(execFile);

async function windowsSerial(port: SerialPortInfoLike): Promise<string | undefined> {
  if (!port.pnpId?.includes('&MI_')) return port.serialNumber;
  const { stdout } = await execFileAsync(pipeHostPath(), ['usb-serial', port.pnpId], {
    windowsHide: true, timeout: 3000,
  });
  return stdout.trim() || undefined;
}

// Only the fields the discovery uses. The real SerialPort.list() returns more;
// tests inject this shape and never open a port.
export interface SerialPortInfoLike {
  path: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  pnpId?: string;
}

function normalizeHex(value: string | undefined): string {
  if (value === undefined) return '';
  return value.toLowerCase().replace(/^0x/, '').padStart(4, '0');
}

function candidateKey(candidate: DeviceCandidate): string {
  return candidate.serialNumber ?? candidate.path;
}

function describe(candidates: DeviceCandidate[]): string {
  return candidates
    .map((candidate) => `${candidate.serialNumber ?? 'no-serial'} @ ${candidate.path}`)
    .join(', ');
}

// Enumerates Espressif USB CDC candidates. It never opens a port and never
// writes to a device it did not identify. The protocol handshake (hello) is the
// compatibility check once the explicitly selected candidate is opened.
export class DeviceDiscovery {
  constructor(
    private readonly listPorts?: () => Promise<SerialPortInfoLike[]>,
  ) {}

  async list(): Promise<DeviceCandidate[]> {
    const ports = this.listPorts !== undefined
      ? await this.listPorts()
      : await (async () => {
          const { SerialPort } = await import('serialport');
          return SerialPort.list();
        })();
    const candidates: DeviceCandidate[] = [];
    for (const port of ports) {
      const vendor = normalizeHex(port.vendorId);
      const product = normalizeHex(port.productId);
      if (vendor !== '303a' || product !== '1001') continue;
      const serial = process.platform === 'win32' && this.listPorts === undefined
        ? await windowsSerial(port)
        : port.serialNumber;
      candidates.push({
        path: port.path,
        vendorId: vendor,
        productId: product,
        ...(serial ? { serialNumber: serial } : {}),
      });
    }
    // Stable order independent of the OS enumeration order. Selection still
    // requires an explicit serial/path when more than one candidate remains.
    return candidates.sort((left, right) => candidateKey(left).localeCompare(candidateKey(right)));
  }

  async select(config: BridgeConfig): Promise<DeviceCandidate> {
    if (config.port !== null) {
      return { path: config.port, vendorId: '', productId: '' };
    }
    if (!config.autoDetect && config.deviceSerial === null) {
      throw new TransportError('no serial port configured', 'absent');
    }
    const candidates = await this.list();
    if (config.deviceSerial !== null) {
      const wanted = config.deviceSerial.toLowerCase();
      const match = candidates.find(
        (candidate) => candidate.serialNumber?.toLowerCase() === wanted,
      );
      if (match === undefined) {
        throw new TransportError(
          `configured device serial not found (${config.deviceSerial}); candidates: ${describe(candidates) || 'none'}`,
          'absent',
        );
      }
      return match;
    }
    if (candidates.length === 0) {
      throw new TransportError('no Espressif USB device found', 'absent');
    }
    if (candidates.length > 1) {
      throw new TransportError(
        `multiple Espressif USB devices found: ${describe(candidates)}; set deviceSerial or port`,
        'absent',
      );
    }
    return candidates[0]!;
  }
}
