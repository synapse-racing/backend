import { Module } from '@nestjs/common';
import { AuthModule } from '@synapse/auth';
import { TrainingService } from './application/training.service';
import { TrainingController } from './presentation/training.controller';

@Module({
  imports: [AuthModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
