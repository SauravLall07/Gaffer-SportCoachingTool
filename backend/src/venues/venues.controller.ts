import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { VenuesService } from './venues.service';
import { createVenueSchema } from './venues.schemas';

@Controller('venues')
@UseGuards(AuthGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.venuesService.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    return this.venuesService.create(user.id, zodValidate(createVenueSchema, body));
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('q') query: unknown,
    @Query('worldwide') worldwide: unknown,
    @Query('lat') lat: unknown,
    @Query('lng') lng: unknown,
    @Query('country') country: unknown,
  ) {
    return this.venuesService.search(user.id, {
      query: typeof query === 'string' ? query : '',
      worldwide: worldwide === 'true',
      latitude: finiteNumber(lat),
      longitude: finiteNumber(lng),
      countryCode: typeof country === 'string' ? country : undefined,
    });
  }

  @Get('nearby')
  nearby(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('lat') lat: unknown,
    @Query('lng') lng: unknown,
    @Query('radius') radius: unknown,
  ) {
    return this.venuesService.nearby(
      user.id,
      finiteNumber(lat),
      finiteNumber(lng),
      finiteNumber(radius) ?? 5000,
    );
  }

  @Get('reverse')
  reverse(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('lat') lat: unknown,
    @Query('lng') lng: unknown,
  ) {
    return this.venuesService.reverse(
      user.id,
      finiteNumber(lat),
      finiteNumber(lng),
    );
  }
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
