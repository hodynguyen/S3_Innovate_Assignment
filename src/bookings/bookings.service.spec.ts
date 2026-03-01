import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { LocationsService } from '../locations/locations.service';
import { Location } from '../locations/entities/location.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

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
  let locationDepartmentRepo: jest.Mocked<Repository<LocationDepartment>>;
  let locationsService: jest.Mocked<LocationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LocationDepartment),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: LocationsService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    bookingRepo = module.get(getRepositoryToken(Booking));
    locationDepartmentRepo = module.get(getRepositoryToken(LocationDepartment));
    locationsService = module.get(LocationsService);

    // Reset the open-time parser mock before each test
    mockIsWithinOpenTime.mockReset();
  });

  describe('create()', () => {
    // -----------------------------------------------------------------------
    // Temporal sanity: startTime must be before endTime
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when startTime equals endTime', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());

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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());

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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(null); // no deptConfig found

      await expect(service.create(makeDto())).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(makeDto())).rejects.toThrow(
        /does not serve department/i,
      );
    });

    it('should include locationNumber and department in the error message when deptConfig is not found', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(null);

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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
      // startTime passes, endTime fails — set up the two-call sequence once
      mockIsWithinOpenTime
        .mockReturnValueOnce(true) // startTime OK
        .mockReturnValueOnce(false); // endTime fails

      const error = await service.create(makeDto()).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(/end time is outside open hours/i);
    });

    it('should NOT check openTime when deptConfig.openTime is null', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(
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
      locationsService.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(
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
      locationsService.findOne.mockResolvedValue(makeLocation());
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
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
      locationsService.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());
      mockIsWithinOpenTime.mockReturnValue(true);
      bookingRepo.createQueryBuilder.mockReturnValue(makeNoOverlapQB());

      const savedBooking = { id: 50 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto());
      expect(result).toBe(savedBooking);
    });
  });
});
