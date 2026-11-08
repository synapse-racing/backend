import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '@synapse/auth';
import { CurrentUser } from '@synapse/auth';
import { UsersService, type PublicUser } from '@synapse/users';
import {
  AppearanceProfileDto,
  VehicleAppearanceDto,
} from './dto/vehicle-appearance.dto';
import type { AppearanceProfile } from '@synapse/domain';
@ApiTags('garage')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@Controller('users/me/appearance')
export class AppearanceController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @ApiOperation({ summary: 'Get the equipped vehicle appearance' })
  @ApiOkResponse({ type: AppearanceProfileDto })
  get(@CurrentUser() user: PublicUser): Promise<AppearanceProfile> {
    return this.users.getAppearance(user.id);
  }
  @Patch()
  @ApiOperation({ summary: 'Equip a vehicle appearance for future races' })
  @ApiOkResponse({ type: AppearanceProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid model, paint, finish, livery or race number',
  })
  save(
    @CurrentUser() user: PublicUser,
    @Body() appearance: VehicleAppearanceDto,
  ): Promise<AppearanceProfile> {
    return this.users.saveAppearance(user.id, appearance);
  }
}
