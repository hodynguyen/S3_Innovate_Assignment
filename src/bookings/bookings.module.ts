import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, LocationDepartment]),
    LocationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
