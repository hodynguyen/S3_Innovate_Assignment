import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginateBookingDto } from './dto/paginate-booking.dto';
import { Booking } from './entities/booking.entity';

@ApiTags('bookings')
@ApiExtraModels(Booking)
@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a booking (validates dept, capacity, open time)',
  })
  @ApiCreatedResponse({
    type: Booking,
    description: 'Booking created successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid request body or business rule violation (dept/capacity/time)',
  })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 409,
    description: 'Location already booked for this time slot',
  })
  create(@Body() dto: CreateBookingDto) {
    this.logger.log(`POST /bookings - location: ${dto.locationNumber}`);
    return this.bookingsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bookings (paginated)' })
  @ApiOkResponse({
    description: 'Paginated list of bookings',
    schema: {
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(Booking) },
        },
        total: { type: 'number', example: 42 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
      },
    },
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() dto: PaginateBookingDto) {
    this.logger.log(`GET /bookings page=${dto.page} limit=${dto.limit}`);
    return this.bookingsService.findAll(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking by id' })
  @ApiOkResponse({ type: Booking })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`GET /bookings/${id}`);
    return this.bookingsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a booking by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 204, description: 'Booking deleted' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`DELETE /bookings/${id}`);
    return this.bookingsService.remove(id);
  }
}
