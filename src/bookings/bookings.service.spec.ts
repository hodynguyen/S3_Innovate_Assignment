import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { LocationsService } from '../locations/locations.service';
import { Location } from '../locations/entities/location.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginateBookingDto } from './dto/paginate-booking.dto';

// ---------------------------------------------------------------------------
// Mock the open-time parser so booking validation tests are deterministic.
// We control the return value per test via the mock's implementation.
// ---------------------------------------------------------------------------
jest.mock('../common/utils/open-time.parser', () => ({
  isWithinOpenTime: jest.fn(),
}));

// Import the mock AFTER jest.mock() so we have a typed reference.
import { isWithinOpenTime } from '../common/utils/open-time.parser';

const mockIsWithinOpenTime = isWithinOpenTime as jest.MockedFunction<
  typeof isWithinOpenTime
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 1,
    locationNumber: 'A-01-01',
    locationName: 'Meeting Room 1',
    building: 'A',
    parent: null,
    children: [],
    departmentConfigs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Location;
}

function makeDeptConfig(
  overrides: Partial<LocationDepartment> = {},
): LocationDepartment {
  return {
    id: 1,
    locationId: 1,
    location: makeLocation(),
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
    ...overrides,
  } as LocationDepartment;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNoOverlapQB(): any {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
}

function makeDto(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
  return {
    locationNumber: 'A-01-01',
    department: 'EFM',
    attendees: 5,
    startTime: '2026-03-10T09:00:00.000Z',
    endTime: '2026-03-10T11:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepo: jest.Mocked<Repository<Booking>>;
  let locationsService: jest.Mocked<
    Pick<LocationsService, 'findFlatByNumber' | 'findDepartmentConfig'>
  >;
  // mockDataSource is captured at module-setup time so individual tests can
  // override .transaction() to simulate error scenarios.
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    // Create the booking repo value first so the mock manager can reference it
    const bookingRepoValue = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockManager = {
      getRepository: jest.fn().mockReturnValue(bookingRepoValue),
    };

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          (
            _isolation: string,
            cb: (m: typeof mockManager) => Promise<unknown>,
          ) => cb(mockManager),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: bookingRepoValue,
        },
        {
          provide: LocationsService,
          useValue: {
            findFlatByNumber: jest.fn(),
            findDepartmentConfig: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    bookingRepo = module.get(getRepositoryToken(Booking));
    locationsService = module.get(LocationsService);

    // Reset the open-time parser mock before each test
    mockIsWithinOpenTime.mockReset();
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create()', () => {
    // -----------------------------------------------------------------------
    // Temporal sanity: startTime must be before endTime
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when startTime equals endTime', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());

      const dto = makeDto({
        startTime: '2026-03-10T09:00:00.000Z',
        endTime: '2026-03-10T09:00:00.000Z',
      });
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /startTime must be before endTime/i,
      );
    });

    it('should throw BadRequestException when startTime is after endTime', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());

      const dto = makeDto({
        startTime: '2026-03-10T11:00:00.000Z',
        endTime: '2026-03-10T09:00:00.000Z',
      });
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /startTime must be before endTime/i,
      );
    });

    // -----------------------------------------------------------------------
    // Rule: Location must serve the requested department (deptConfig lookup)
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when no LocationDepartment row exists for the requested department', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(null); // no deptConfig found

      await expect(service.create(makeDto())).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(makeDto())).rejects.toThrow(
        /does not serve department/i,
      );
    });

    it('should include locationNumber and department in the error message when deptConfig is not found', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(null);

      const dto = makeDto({ department: 'HR' });
      const error = await service.create(dto).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('A-01-01');
      expect(error.message).toContain('HR');
    });

    // -----------------------------------------------------------------------
    // Rule: Capacity check (uses deptConfig.capacity)
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when attendees exceed deptConfig capacity', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(
        makeDeptConfig({ capacity: 10 }),
      );

      await expect(service.create(makeDto({ attendees: 11 }))).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(makeDto({ attendees: 11 }))).rejects.toThrow(
        /capacity exceeded/i,
      );
    });

    it('should NOT throw for attendees exactly equal to deptConfig capacity', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(
        makeDeptConfig({ capacity: 10 }),
      );
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 1 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto({ attendees: 10 }));
      expect(result).toBe(savedBooking);
    });

    // -----------------------------------------------------------------------
    // Rule: Open time validation (uses deptConfig.openTime)
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when startTime is outside deptConfig openTime window', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      // First call (startTime) → false; second call (endTime) would not be reached
      mockIsWithinOpenTime.mockReturnValueOnce(false);

      await expect(service.create(makeDto())).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(makeDto())).rejects.toThrow(
        /start time is outside open hours/i,
      );
    });

    it('should throw BadRequestException when endTime is outside deptConfig openTime window', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      // startTime passes, endTime fails — set up the two-call sequence once
      mockIsWithinOpenTime
        .mockReturnValueOnce(true) // startTime OK
        .mockReturnValueOnce(false); // endTime fails

      const error = await service.create(makeDto()).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(/end time is outside open hours/i);
    });

    it('should throw BadRequestException when openTime format is invalid', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockImplementation(() => {
        throw new Error('Unrecognized openTime format');
      });

      const error = await service.create(makeDto()).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(/invalid opentime format/i);
    });

    it('should NOT check openTime when deptConfig.openTime is null', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(
        makeDeptConfig({ openTime: null }),
      );
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 2 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto());
      expect(result).toBe(savedBooking);
      // isWithinOpenTime must NOT have been called because openTime is null
      expect(mockIsWithinOpenTime).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    it('should create and return a booking when all validations pass', async () => {
      const location = makeLocation();
      locationsService.findFlatByNumber.mockResolvedValue(location);
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = {
        id: 42,
        department: 'EFM',
        attendees: 5,
        location,
      } as unknown as Booking;

      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const dto = makeDto();
      const result = await service.create(dto);

      expect(result).toBe(savedBooking);
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          department: dto.department,
          attendees: dto.attendees,
          location,
        }),
      );
      expect(bookingRepo.save).toHaveBeenCalledWith(savedBooking);
    });

    it('should pass startTime and endTime as Date objects to bookingRepo.create()', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 1 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const dto = makeDto();
      await service.create(dto);

      const createCall = bookingRepo.create.mock
        .calls[0][0] as Partial<Booking>;
      expect(createCall.startTime).toBeInstanceOf(Date);
      expect(createCall.endTime).toBeInstanceOf(Date);
    });

    // -----------------------------------------------------------------------
    // "Always open" location
    // -----------------------------------------------------------------------

    it('should allow booking at any time for a deptConfig with "Always open" openTime', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(
        makeDeptConfig({ openTime: 'Always open' }),
      );

      // When openTime is "Always open", the real isWithinOpenTime returns true.
      // We mock it to return true here to reflect that behaviour.
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 99 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      // Use a weekend time that would be invalid for Mon–Fri patterns
      const dto = makeDto({
        startTime: '2026-03-07T22:00:00.000Z', // Saturday evening
        endTime: '2026-03-07T23:00:00.000Z',
      });

      const result = await service.create(dto);
      expect(result).toBe(savedBooking);
    });

    // -----------------------------------------------------------------------
    // Overlap check
    // -----------------------------------------------------------------------

    it('should throw ConflictException when an overlapping booking exists', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);

      const existingBooking = {
        id: 7,
        startTime: new Date('2026-03-10T09:00:00.000Z'),
        endTime: new Date('2026-03-10T11:00:00.000Z'),
      } as Booking;

      bookingRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingBooking),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(service.create(makeDto())).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(makeDto())).rejects.toThrow(
        /already booked from/i,
      );
    });

    it('should proceed normally when no overlapping booking exists', async () => {
      const location = makeLocation();
      locationsService.findFlatByNumber.mockResolvedValue(location);
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 50 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto());
      expect(result).toBe(savedBooking);
    });

    // -----------------------------------------------------------------------
    // PostgreSQL serialization failure (40001) → 409 ConflictException
    // -----------------------------------------------------------------------

    it('should throw ConflictException when transaction fails with PostgreSQL error 40001', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);

      // Simulate the SERIALIZABLE transaction being aborted by PostgreSQL
      const pgError = new QueryFailedError('SELECT 1', [], {
        code: '40001',
        message: 'could not serialize access due to concurrent update',
      } as unknown as Error);

      mockDataSource.transaction.mockRejectedValueOnce(pgError);

      const error = await service.create(makeDto()).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/concurrent conflict/i);
    });

    it('should re-throw non-40001 QueryFailedErrors as-is', async () => {
      locationsService.findFlatByNumber.mockResolvedValue(makeLocation());
      locationsService.findDepartmentConfig.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);

      const pgError = new QueryFailedError('INSERT', [], {
        code: '23505', // unique violation — should not be swallowed
        message: 'duplicate key value violates unique constraint',
      } as unknown as Error);

      mockDataSource.transaction.mockRejectedValueOnce(pgError);

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        QueryFailedError,
      );
    });
  });

  // =========================================================================
  // findAll()
  // =========================================================================

  describe('findAll()', () => {
    it('should return paginated bookings in descending creation order', async () => {
      const bookings = [{ id: 2 }, { id: 1 }] as Booking[];
      bookingRepo.findAndCount.mockResolvedValue([bookings, 2]);

      const dto: PaginateBookingDto = { page: 1, limit: 20 };
      const result = await service.findAll(dto);

      expect(result).toEqual({ data: bookings, total: 2, page: 1, limit: 20 });
      expect(bookingRepo.findAndCount).toHaveBeenCalledWith({
        relations: ['location'],
        take: 20,
        skip: 0,
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty data array when no bookings exist', async () => {
      bookingRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should apply correct skip for page 2', async () => {
      bookingRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 2, limit: 10 });
      expect(bookingRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // =========================================================================
  // findOne()
  // =========================================================================

  describe('findOne()', () => {
    it('should throw NotFoundException when booking not found', async () => {
      bookingRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow(/999/);
    });

    it('should return the booking when found', async () => {
      const booking = { id: 5, department: 'EFM' } as Booking;
      bookingRepo.findOne.mockResolvedValue(booking);

      const result = await service.findOne(5);
      expect(result).toBe(booking);
      expect(bookingRepo.findOne).toHaveBeenCalledWith({
        where: { id: 5 },
        relations: ['location'],
      });
    });
  });

  // =========================================================================
  // remove()
  // =========================================================================

  describe('remove()', () => {
    it('should throw NotFoundException when booking not found', async () => {
      bookingRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('should call bookingRepo.remove on success', async () => {
      const booking = { id: 3 } as Booking;
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.remove.mockResolvedValue(booking);

      await service.remove(3);
      expect(bookingRepo.remove).toHaveBeenCalledWith(booking);
    });
  });
});
