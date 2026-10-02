import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [VenuesController],
  providers: [VenuesService],
})
export class VenuesModule {}
