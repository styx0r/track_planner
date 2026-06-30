import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CpuTemperature {
  /** CPU temperature in °C, or null if unavailable */
  celsius: number | null;
  /** Name of the sensor the value was taken from (e.g. "CPU Package") */
  label: string | null;
  /** Whether a reading could be obtained */
  available: boolean;
}

interface LhmNode {
  Text?: string;
  Value?: string;
  Children?: LhmNode[];
}

interface TempSensor {
  text: string;
  celsius: number;
}

/** Parse a LibreHardwareMonitor value like "52.0 °C" or "52,0 °C" (German locale). */
function parseCelsius(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Heuristic: does this hardware node represent a CPU? */
function isCpuHardware(text: string): boolean {
  return /intel|amd|ryzen|core\s*i\d|xeon|threadripper|processor|cpu/i.test(text);
}

/**
 * Walk the LHM sensor tree and collect all temperature sensors that live
 * underneath a CPU hardware node — this excludes GPU/mainboard temperatures.
 */
function collectCpuTemps(node: LhmNode | undefined, insideCpu: boolean, acc: TempSensor[]): void {
  if (!node) return;
  const text = node.Text ?? '';
  const nowInside = insideCpu || (isCpuHardware(text) && !!node.Children?.length);

  if (nowInside && node.Value && /°\s*c/i.test(node.Value)) {
    const celsius = parseCelsius(node.Value);
    if (celsius !== null) acc.push({ text, celsius });
  }

  for (const child of node.Children ?? []) {
    collectCpuTemps(child, nowInside, acc);
  }
}

/** Pick the most representative CPU temperature from the collected sensors. */
function pickCpuTemp(sensors: TempSensor[]): TempSensor | null {
  if (sensors.length === 0) return null;
  return (
    sensors.find((s) => /package/i.test(s.text)) ??
    sensors.find((s) => /tctl|tdie/i.test(s.text)) ??
    sensors.find((s) => /core\s*(average|max)/i.test(s.text)) ??
    sensors.reduce((max, s) => (s.celsius > max.celsius ? s : max))
  );
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private readonly url: string;
  private readonly timeoutMs = 1500;
  private readonly cacheTtlMs = 2000;
  private cache: { at: number; data: CpuTemperature } | null = null;

  constructor(private readonly configService: ConfigService) {
    // Native-Windows backend: 127.0.0.1 (NOT "localhost" — Node may resolve that
    // to IPv6 ::1 while LHM only listens on IPv4). In a Docker container, point
    // this at the host via CPU_TEMP_URL=http://host.docker.internal:8085/data.json
    this.url = this.configService.get<string>(
      'CPU_TEMP_URL',
      'http://127.0.0.1:8085/data.json',
    );
  }

  async getCpuTemperature(): Promise<CpuTemperature> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) {
      return this.cache.data;
    }

    let data: CpuTemperature = { celsius: null, label: null, available: false };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(this.url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const json = (await res.json()) as LhmNode;
        const sensors: TempSensor[] = [];
        collectCpuTemps(json, false, sensors);
        const pick = pickCpuTemp(sensors);
        if (pick) {
          data = { celsius: Math.round(pick.celsius), label: pick.text, available: true };
        }
      } else {
        this.logger.debug(`CPU temp source returned HTTP ${res.status}`);
      }
    } catch (err) {
      // LibreHardwareMonitor not running / unreachable / wrong URL — degrade gracefully.
      this.logger.debug(`CPU temp unavailable: ${(err as Error).message}`);
    }

    this.cache = { at: now, data };
    return data;
  }
}
