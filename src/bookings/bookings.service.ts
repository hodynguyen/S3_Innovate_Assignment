import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { LocationsService } from '../locations/locations.service';
import { isWithinOpenTime } from '../common/utils/open-time.parser';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly locationsService: LocationsService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    this.logger.log(`Creating booking for location: ${dto.locationNumber}`);

    const location = await this.locationsService.findOne(dto.locationNumber);

    // Temporal sanity: startTime must be strictly before endTime
    const startDate = new Date(dto.startTime);
    const endDate = new Date(dto.endTime);
    if (startDate >= endDate) {
      throw new BadRequestException(
        `startTime must be before endTime (got startTime=${dto.startTime}, endTime=${dto.endTime})`,
      );
    }

    // Rule 1: location must be bookable (has department + capacity)
    if (!location.department || location.capacity === null) {
      throw new BadRequestException(
        `Location '${dto.locationNumber}' is not bookable (no department or capacity defined)`,
      );
    }

    // Rule 2: Department matching
    if (location.department !== dto.department) {
      throw new BadRequestException(
        `Department mismatch: location '${dto.locationNumber}' is assigned to '${location.department}', got '${dto.department}'`,
      );
    }

    // Rule 3: Capacity check
    if (dto.attendees > location.capacity) {
      throw new BadRequestException(
        `Capacity exceeded: location '${dto.locationNumber}' holds ${location.capacity} people, requested ${dto.attendees}`,
      );
    }

    // Rule 4: Open time validation
    if (location.openTime) {
      if (!isWithinOpenTime(location.openTime, startDate)) {
        throw new BadRequestException(
          `Booking start time is outside open hours for '${dto.locationNumber}' (${location.openTime})`,
        );
      }
      if (!isWithinOpenTime(location.openTime, endDate)) {
        throw new BadRequestException(
          `Booking end time is outside open hours for '${dto.locationNumber}' (${location.openTime})`,
        );
      }
    }

    const booking = this.bookingRepo.create({
      location,
      department: dto.department,
      attendees: dto.attendees,
      startTime: startDate,
      endTime: endDate,
    });

    const saved = await this.bookingRepo.save(booking);
    this.logger.log(`Booking created: id=${saved.id} for ${dto.locationNumber}`);
    return saved;
  }

  async findAll(): Promise<Booking[]> {
    this.logger.log('Fetching all bookings');
    return this.bookingRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }
    return booking;
  }
}
