import { Injectable } from '@nestjs/common';

@Injectable()
export class LightService {
  private lightState = 0; // 0 for off, 1 for on

  getLightState(): number {
    return this.lightState;
  }

  switchLight(): number {
    this.lightState = this.lightState === 0 ? 1 : 0;
    return this.lightState;
  }
}
