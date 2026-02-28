import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  private readonly logger = new Logger(LocationsController.name);

  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new location node' })
  @ApiCreatedResponse({ description: 'Location created successfully' })
  @ApiResponse({ status: 409, description: 'Location number already exists' })
  create(@Body() dto: CreateLocationDto) {
    this.logger.log(`POST /locations - ${dto.locationNumber}`);
    return this.locationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get full location tree (nested)' })
  findAll() {
    this.logger.log('GET /locations');
    return this.locationsService.findTree();
  }

  @Get(':locationNumber')
  @ApiOperation({ summary: 'Get a location and its descendants by locationNumber' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  findOne(@Param('locationNumber') locationNumber: string) {
    this.logger.log(`GET /locations/${locationNumber}`);
    return this.locationsService.findOne(locationNumber);
  }

  @Patch(':locationNumber')
  @ApiOperation({ summary: 'Update a location by locationNumber' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  update(
    @Param('locationNumber') locationNumber: string,
    @Body() dto: UpdateLocationDto,
  ) {
    this.logger.log(`PATCH /locations/${locationNumber}`);
    return this.locationsService.update(locationNumber, dto);
  }

  @Delete(':locationNumber')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a location by locationNumber' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiResponse({ status: 204, description: 'Location deleted' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  remove(@Param('locationNumber') locationNumber: string) {
    this.logger.log(`DELETE /locations/${locationNumber}`);
    return this.locationsService.remove(locationNumber);
  }
}
