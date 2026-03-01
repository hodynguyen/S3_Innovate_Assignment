import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginateBookingDto } from './dto/paginate-booking.dto';
import { LocationsService } from '../locations/locations.service';
import { isWithinOpenTime } from '../common/utils/open-time.parser';

export interface PaginatedBookings {
  data: Booking[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(LocationDepartment)
    private readonly locationDepartmentRepo: Repository<LocationDepartment>,
    private readonly locationsService: LocationsService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    this.logger.log(`Creating booking for location: ${dto.locationNumber}`);

    const location = await this.locationsService.findFlatByNumber(
      dto.locationNumber,
    );

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
      let startOk: boolean;
      let endOk: boolean;
      try {
        startOk = isWithinOpenTime(deptConfig.openTime, startDate);
        endOk = isWithinOpenTime(deptConfig.openTime, endDate);
      } catch {
        throw new BadRequestException(
          `Invalid openTime format for '${dto.locationNumber}' / '${dto.department}'`,
        );
      }
      if (!startOk) {
        throw new BadRequestException(
          `Booking start time is outside open hours for '${dto.locationNumber}' / '${dto.department}' (${deptConfig.openTime})`,
        );
      }
      if (!endOk) {
        throw new BadRequestException(
          `Booking end time is outside open hours for '${dto.locationNumber}' / '${dto.department}' (${deptConfig.openTime})`,
        );
      }
    }

    // Overlap check + save in a SERIALIZABLE transaction to prevent race conditions
    return this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager: EntityManager) => {
        const bookingRepo = manager.getRepository(Booking);

        const overlapping = await bookingRepo
          .createQueryBuilder('booking')
          .where('booking.locationId = :locationId', {
            locationId: location.id,
          })
          .andWhere('booking.startTime < :endTime', { endTime: endDate })
          .andWhere('booking.endTime > :startTime', { startTime: startDate })
          .getOne();

        if (overlapping) {
          throw new ConflictException(
            `Location '${dto.locationNumber}' is already booked from ${overlapping.startTime.toISOString()} to ${overlapping.endTime.toISOString()}`,
          );
        }

        const booking = bookingRepo.create({
          location,
          department: dto.department,
          attendees: dto.attendees,
          startTime: startDate,
          endTime: endDate,
        });

        const saved = await bookingRepo.save(booking);
        this.logger.log(
          `Booking created: id=${saved.id} for ${dto.locationNumber}`,
        );
        return saved;
      },
    );
  }

  async findAll(dto: PaginateBookingDto): Promise<PaginatedBookings> {
    this.logger.log(`Fetching bookings page=${dto.page} limit=${dto.limit}`);
    const { page = 1, limit = 20 } = dto;
    const [data, total] = await this.bookingRepo.findAndCount({
      take: limit,
      skip: (page - 1) * limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }
    return booking;
  }

  async remove(id: number): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }
    await this.bookingRepo.remove(booking);
    this.logger.log(`Booking removed: id=${id}`);
  }
}
