import { Module } from '@nestjs/common';
import { AuthModule } from '@synapse/auth';
import { AppearanceController } from './presentation/appearance.controller';
@Module({ imports: [AuthModule], controllers: [AppearanceController] })
export class GarageModule {}
