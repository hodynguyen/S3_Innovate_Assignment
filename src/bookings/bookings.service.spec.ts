import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
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

const mockIsWithinOpenTime = isWithinOpenTime as jest.MockedFunction<typeof isWithinOpenTime>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 1,
    locationNumber: 'A-01-01',
    locationName: 'Meeting Room 1',
    building: 'A',
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
    parent: null,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Location;
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
    locationsService = module.get(LocationsService);

    // Reset the open-time parser mock before each test
    mockIsWithinOpenTime.mockReset();
  });

  describe('create()', () => {
    // -----------------------------------------------------------------------
    // Rule 1: Location must be bookable
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when location has no department (non-bookable)', async () => {
      locationsService.findOne.mockResolvedValue(
        makeLocation({ department: null }),
      );

      await expect(service.create(makeDto())).rejects.toThrow(BadRequestException);
      await expect(service.create(makeDto())).rejects.toThrow(/not bookable/i);
    });

    it('should throw BadRequestException when location has no capacity (non-bookable)', async () => {
      locationsService.findOne.mockResolvedValue(
        makeLocation({ capacity: null }),
      );

      await expect(service.create(makeDto())).rejects.toThrow(BadRequestException);
      await expect(service.create(makeDto())).rejects.toThrow(/not bookable/i);
    });

    it('should throw BadRequestException when location has neither department nor capacity', async () => {
      locationsService.findOne.mockResolvedValue(
        makeLocation({ department: null, capacity: null }),
      );

      await expect(service.create(makeDto())).rejects.toThrow(BadRequestException);
    });

    // -----------------------------------------------------------------------
    // Rule 2: Department matching
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when booking department does not match location department', async () => {
      locationsService.findOne.mockResolvedValue(
        makeLocation({ department: 'FSS' }),
      );

      await expect(
        service.create(makeDto({ department: 'EFM' })),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(makeDto({ department: 'EFM' })),
      ).rejects.toThrow(/department mismatch/i);
    });

    // -----------------------------------------------------------------------
    // Rule 3: Capacity check
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when attendees exceed capacity', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation({ capacity: 10 }));

      await expect(
        service.create(makeDto({ attendees: 11 })),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(makeDto({ attendees: 11 })),
      ).rejects.toThrow(/capacity exceeded/i);
    });

    it('should NOT throw for attendees exactly equal to capacity', async () => {
      const location = makeLocation({ capacity: 10 });
      locationsService.findOne.mockResolvedValue(location);
      mockIsWithinOpenTime.mockReturnValue(true);

      const savedBooking = { id: 1 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto({ attendees: 10 }));
      expect(result).toBe(savedBooking);
    });

    // -----------------------------------------------------------------------
    // Rule 4: Open time validation
    // -----------------------------------------------------------------------

    it('should throw BadRequestException when startTime is outside openTime window', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation());
      // First call (startTime) → false; second call (endTime) would not be reached
      mockIsWithinOpenTime.mockReturnValueOnce(false);

      await expect(service.create(makeDto())).rejects.toThrow(BadRequestException);
      await expect(service.create(makeDto())).rejects.toThrow(/start time is outside open hours/i);
    });

    it('should throw BadRequestException when endTime is outside openTime window', async () => {
      locationsService.findOne.mockResolvedValue(makeLocation());
      // startTime passes, endTime fails — set up the two-call sequence once
      mockIsWithinOpenTime
        .mockReturnValueOnce(true)   // startTime OK
        .mockReturnValueOnce(false); // endTime fails

      const error = await service.create(makeDto()).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(/end time is outside open hours/i);
    });

    it('should NOT check openTime when location has no openTime field (null)', async () => {
      const location = makeLocation({ openTime: null });
      locationsService.findOne.mockResolvedValue(location);

      const savedBooking = { id: 2 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const result = await service.create(makeDto());
      expect(result).toBe(savedBooking);
      // isWithinOpenTime must NOT have been called because openTime is falsy
      expect(mockIsWithinOpenTime).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    it('should create and return a booking when all validations pass', async () => {
      const location = makeLocation();
      locationsService.findOne.mockResolvedValue(location);
      mockIsWithinOpenTime.mockReturnValue(true);

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
      const location = makeLocation();
      locationsService.findOne.mockResolvedValue(location);
      mockIsWithinOpenTime.mockReturnValue(true);

      const savedBooking = { id: 1 } as Booking;
      bookingRepo.create.mockReturnValue(savedBooking);
      bookingRepo.save.mockResolvedValue(savedBooking);

      const dto = makeDto();
      await service.create(dto);

      const createCall = bookingRepo.create.mock.calls[0][0] as Partial<Booking>;
      expect(createCall.startTime).toBeInstanceOf(Date);
      expect(createCall.endTime).toBeInstanceOf(Date);
    });

    // -----------------------------------------------------------------------
    // "Always open" location
    // -----------------------------------------------------------------------

    it('should allow booking at any time for an "Always open" location', async () => {
      const location = makeLocation({ openTime: 'Always open' });
      locationsService.findOne.mockResolvedValue(location);

      // When openTime is "Always open", the real isWithinOpenTime returns true.
      // We mock it to return true here to reflect that behaviour.
      mockIsWithinOpenTime.mockReturnValue(true);

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
  });
});
