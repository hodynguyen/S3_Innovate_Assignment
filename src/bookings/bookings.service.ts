import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { LocationsService } from '../locations/locations.service';
import { isWithinOpenTime } from '../common/utils/open-time.parser';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(LocationDepartment)
    private readonly locationDepartmentRepo: Repository<LocationDepartment>,
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

    // Look up the LocationDepartment row for this (location, department) pair
    const deptConfig = await this.locationDepartmentRepo.findOne({
      where: { locationId: location.id, department: dto.department },
    });
    if (!deptConfig) {
      throw new BadRequestException(
        `Location '${dto.locationNumber}' does not serve department '${dto.department}'`,
      );
    }

    // Capacity check: attendees must not exceed department-specific capacity
    if (dto.attendees > deptConfig.capacity) {
      throw new BadRequestException(
        `Capacity exceeded: department '${dto.department}' at '${dto.locationNumber}' holds ${deptConfig.capacity}, requested ${dto.attendees}`,
      );
    }

    // Open time validation: both start and end must fall within the open window
    if (deptConfig.openTime) {
      if (!isWithinOpenTime(deptConfig.openTime, startDate)) {
        throw new BadRequestException(
          `Booking start time is outside open hours for '${dto.locationNumber}' / '${dto.department}' (${deptConfig.openTime})`,
        );
      }
      if (!isWithinOpenTime(deptConfig.openTime, endDate)) {
        throw new BadRequestException(
          `Booking end time is outside open hours for '${dto.locationNumber}' / '${dto.department}' (${deptConfig.openTime})`,
        );
      }
    }

    // Overlap check: reject if another booking at the same location overlaps this time window
    const overlapping = await this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.locationId = :locationId', { locationId: location.id })
      .andWhere('booking.startTime < :endTime', { endTime: endDate })
      .andWhere('booking.endTime > :startTime', { startTime: startDate })
      .getOne();

    if (overlapping) {
      throw new ConflictException(
        `Location '${dto.locationNumber}' is already booked from ${overlapping.startTime.toISOString()} to ${overlapping.endTime.toISOString()}`,
      );
    }

    const booking = this.bookingRepo.create({
      location,
      department: dto.department,
      attendees: dto.attendees,
      startTime: startDate,
      endTime: endDate,
    });

    const saved = await this.bookingRepo.save(booking);
    this.logger.log(
      `Booking created: id=${saved.id} for ${dto.locationNumber}`,
    );
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
