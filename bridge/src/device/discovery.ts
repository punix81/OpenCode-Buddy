import type { BridgeConfig } from '../config.js';
import { TransportError } from '../transport/types.js';

export interface DeviceCandidate {
  path: string;
  vendorId: string;
  productId: string;
  serialNumber?: string;
}

function normalizeHex(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  return value.toLowerCase().replace(/^0x/, '').padStart(4, '0');
}

// Enumerates Espressif USB CDC candidates. It never opens a port and never
// writes to a device it did not identify.
export class DeviceDiscovery {
  async list(): Promise<DeviceCandidate[]> {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    const candidates: DeviceCandidate[] = [];
    for (const port of ports) {
      const vendor = normalizeHex(port.vendorId);
      const product = normalizeHex(port.productId);
      if (vendor === '303a' && product === '1001') {
        candidates.push({
          path: port.path,
          vendorId: vendor,
          productId: product,
          ...(port.serialNumber !== undefined ? { serialNumber: port.serialNumber } : {}),
        });
      }
    }
    return candidates;
  }

  async select(config: BridgeConfig): Promise<DeviceCandidate> {
    if (config.port !== null) {
      return { path: config.port, vendorId: '', productId: '' };
    }
    if (!config.autoDetect) {
      throw new TransportError('no serial port configured', 'absent');
    }
    const candidates = await this.list();
    const first = candidates[0];
    if (first === undefined) {
      throw new TransportError('no Espressif USB device found', 'absent');
    }
    return first;
  }
}
