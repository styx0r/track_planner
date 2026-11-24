import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

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

// Linux sysfs: hwmon drivers that report the CPU's own temperature
// (Intel, AMD, AMD alt. driver, Raspberry Pi / ARM SoCs).
const SYSFS_CLASS = '/sys/class';
const CPU_HWMON_NAMES = /^(coretemp|k10temp|zenpower|cpu_thermal|soc_thermal)$/i;
// Fallback when no hwmon driver is loaded.
const CPU_THERMAL_ZONE_TYPES = /^(x86_pkg_temp|cpu[-_]thermal|soc[-_]thermal)$/i;

async function readText(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, 'utf8')).trim();
  } catch {
    return null;
  }
}

/** sysfs temperatures are integers in millidegrees Celsius. */
async function readMilliCelsius(file: string): Promise<number | null> {
  const raw = await readText(file);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n / 1000 : null;
}

async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

/**
 * Linux: read CPU temperatures from sysfs. Also works inside Docker on a
 * Linux host, since containers see the host's (read-only) /sys.
 */
async function readLinuxCpuTemps(): Promise<TempSensor[]> {
  const sensors: TempSensor[] = [];

  const hwmonRoot = path.join(SYSFS_CLASS, 'hwmon');
  for (const hwmon of await listDir(hwmonRoot)) {
    const dir = path.join(hwmonRoot, hwmon);
    const name = await readText(path.join(dir, 'name'));
    if (!name || !CPU_HWMON_NAMES.test(name)) continue;

    for (const file of await listDir(dir)) {
      const match = file.match(/^(temp\d+)_input$/);
      if (!match) continue;
      const celsius = await readMilliCelsius(path.join(dir, file));
      if (celsius === null) continue;
      // Labels like "Package id 0", "Core 0" (Intel) or "Tctl"/"Tccd1" (AMD)
      const label = await readText(path.join(dir, `${match[1]}_label`));
      sensors.push({ text: label || name, celsius });
    }
  }
  if (sensors.length > 0) return sensors;

  const thermalRoot = path.join(SYSFS_CLASS, 'thermal');
  for (const zone of await listDir(thermalRoot)) {
    if (!zone.startsWith('thermal_zone')) continue;
    const type = await readText(path.join(thermalRoot, zone, 'type'));
    if (!type || !CPU_THERMAL_ZONE_TYPES.test(type)) continue;
    const celsius = await readMilliCelsius(path.join(thermalRoot, zone, 'temp'));
    if (celsius !== null) sensors.push({ text: type, celsius });
  }
  return sensors;
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private readonly url: string;
  private readonly urlConfigured: boolean;
  private readonly timeoutMs = 1500;
  private readonly cacheTtlMs = 2000;
  private cache: { at: number; data: CpuTemperature } | null = null;

  constructor(private readonly configService: ConfigService) {
    // Native-Windows backend: 127.0.0.1 (NOT "localhost" — Node may resolve that
    // to IPv6 ::1 while LHM only listens on IPv4). In a Docker container on a
    // Windows host, point this at the host via
    // CPU_TEMP_URL=http://host.docker.internal:8085/data.json
    const configuredUrl = this.configService.get<string>('CPU_TEMP_URL')?.trim();
    this.urlConfigured = !!configuredUrl;
    this.url = configuredUrl || 'http://127.0.0.1:8085/data.json';
  }

  async getCpuTemperature(): Promise<CpuTemperature> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) {
      return this.cache.data;
    }

    // An explicit CPU_TEMP_URL always wins. Otherwise Linux reads sysfs and
    // Windows asks LibreHardwareMonitor on localhost.
    const sensors = this.urlConfigured || process.platform !== 'linux'
      ? await this.readLhmCpuTemps()
      : await readLinuxCpuTemps();

    const pick = pickCpuTemp(sensors);
    const data: CpuTemperature = pick
      ? { celsius: Math.round(pick.celsius), label: pick.text, available: true }
      : { celsius: null, label: null, available: false };

    this.cache = { at: now, data };
    return data;
  }

  private async readLhmCpuTemps(): Promise<TempSensor[]> {
    const sensors: TempSensor[] = [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(this.url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        collectCpuTemps((await res.json()) as LhmNode, false, sensors);
      } else {
        this.logger.debug(`CPU temp source returned HTTP ${res.status}`);
      }
    } catch (err) {
      // LibreHardwareMonitor not running / unreachable / wrong URL — degrade gracefully.
      this.logger.debug(`CPU temp unavailable: ${(err as Error).message}`);
    }
    return sensors;
  }
}
