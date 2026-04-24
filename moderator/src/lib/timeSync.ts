/**
 * Time Synchronization Module
 * 
 * Implements an NTP-like algorithm to synchronize client clock with server.
 * Uses multiple round-trip samples to calculate accurate clock offset.
 */

import { Socket } from 'socket.io-client';
import { WS_EVENTS, TimeSyncRequest, TimeSyncResponse } from './types';

export interface TimeSyncResult {
  offset: number;      // Clock offset in ms (add to local time to get server time)
  roundTrip: number;   // Average round-trip latency in ms
  samples: number;     // Number of valid samples used
  accuracy: number;    // Estimated accuracy (standard deviation) in ms
}

interface SyncSample {
  offset: number;
  roundTrip: number;
}

/**
 * Performs time synchronization with the server
 * 
 * @param socket - Connected Socket.IO socket
 * @param numSamples - Number of sync requests to send (default: 15)
 * @param delayBetweenSamples - Delay between samples in ms (default: 100)
 * @returns Promise resolving to TimeSyncResult
 */
export async function performTimeSync(
  socket: Socket,
  numSamples: number = 15,
  delayBetweenSamples: number = 100
): Promise<TimeSyncResult> {
  const samples: SyncSample[] = [];

  for (let i = 0; i < numSamples; i++) {
    try {
      const sample = await performSingleSync(socket);
      samples.push(sample);
    } catch (error) {
      console.warn(`Sync sample ${i} failed:`, error);
    }
    
    // Wait between samples
    if (i < numSamples - 1) {
      await sleep(delayBetweenSamples);
    }
  }

  if (samples.length === 0) {
    throw new Error('All sync samples failed');
  }

  // Sort by round-trip time and discard outliers (keep best 60%)
  samples.sort((a, b) => a.roundTrip - b.roundTrip);
  const validSamples = samples.slice(0, Math.ceil(samples.length * 0.6));

  // Calculate median offset for robustness
  const offsets = validSamples.map(s => s.offset).sort((a, b) => a - b);
  const medianOffset = offsets[Math.floor(offsets.length / 2)];

  // Calculate average round-trip
  const avgRoundTrip = validSamples.reduce((sum, s) => sum + s.roundTrip, 0) / validSamples.length;

  // Calculate accuracy (standard deviation of offsets)
  const variance = validSamples.reduce((sum, s) => sum + Math.pow(s.offset - medianOffset, 2), 0) / validSamples.length;
  const accuracy = Math.sqrt(variance);

  return {
    offset: medianOffset,
    roundTrip: avgRoundTrip,
    samples: validSamples.length,
    accuracy,
  };
}

/**
 * Performs a single time sync round-trip
 */
function performSingleSync(socket: Socket): Promise<SyncSample> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Sync timeout'));
    }, 5000);

    const t0 = Date.now();
    
    const handleResponse = (response: TimeSyncResponse) => {
      clearTimeout(timeout);
      const t3 = Date.now();
      
      // NTP-like calculation
      // offset = ((t1 - t0) + (t2 - t3)) / 2
      // roundTrip = (t3 - t0) - (t2 - t1)
      const offset = ((response.t1 - response.t0) + (response.t2 - t3)) / 2;
      const roundTrip = (t3 - response.t0) - (response.t2 - response.t1);
      
      socket.off(WS_EVENTS.TIME_SYNC_RESPONSE, handleResponse);
      resolve({ offset, roundTrip });
    };

    socket.on(WS_EVENTS.TIME_SYNC_RESPONSE, handleResponse);
    
    const request: TimeSyncRequest = { t0 };
    socket.emit(WS_EVENTS.TIME_SYNC, request);
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get synchronized time (local time + offset)
 */
export function getSyncedTime(offset: number): number {
  return Date.now() + offset;
}

/**
 * Calculate when to start local action to sync with server scheduled time
 * 
 * @param scheduledServerTime - When server will start (server time)
 * @param offset - Clock offset from sync
 * @returns Local timestamp when client should start
 */
export function getLocalStartTime(scheduledServerTime: number, offset: number): number {
  // scheduledServerTime is in server time
  // Convert to local time by subtracting offset
  return scheduledServerTime - offset;
}

/**
 * Time until scheduled start
 */
export function getTimeUntilStart(scheduledServerTime: number, offset: number): number {
  const localStartTime = getLocalStartTime(scheduledServerTime, offset);
  return localStartTime - Date.now();
}



