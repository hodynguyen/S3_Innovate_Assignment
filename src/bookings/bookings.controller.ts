import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking (validates dept, capacity, open time)' })
  @ApiCreatedResponse({ description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body or business rule violation (dept/capacity/time)' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  create(@Body() dto: CreateBookingDto) {
    this.logger.log(`POST /bookings - location: ${dto.locationNumber}`);
    return this.bookingsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bookings' })
  findAll() {
    this.logger.log('GET /bookings');
    return this.bookingsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`GET /bookings/${id}`);
    return this.bookingsService.findOne(id);
  }
}
