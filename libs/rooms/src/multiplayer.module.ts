import { Module } from '@nestjs/common';
import { AuthModule } from '@synapse/auth';
import { TrainingModule } from '@synapse/training';
import { RoomService } from './application/room.service';
import { MultiplayerGateway } from './presentation/multiplayer.gateway';

@Module({
  imports: [AuthModule, TrainingModule],
  providers: [RoomService, MultiplayerGateway],
})
export class MultiplayerModule {}
