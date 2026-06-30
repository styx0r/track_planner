import { Controller, Get } from '@nestjs/common';
import { CpuTemperature, SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('temperature')
  getTemperature(): Promise<CpuTemperature> {
    return this.systemService.getCpuTemperature();
  }
}
