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
import { CreateLocationDepartmentDto } from './dto/create-location-department.dto';
import { UpdateLocationDepartmentDto } from './dto/update-location-department.dto';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  private readonly logger = new Logger(LocationsController.name);

  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new location node' })
  @ApiCreatedResponse({ description: 'Location created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body (validation error)',
  })
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

  @Get(':locationNumber/departments')
  @ApiOperation({ summary: 'Get all department configs for a location' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiResponse({ status: 200, description: 'List of department configs' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  findDepartments(@Param('locationNumber') locationNumber: string) {
    this.logger.log(`GET /locations/${locationNumber}/departments`);
    return this.locationsService.findDepartments(locationNumber);
  }

  @Post(':locationNumber/departments')
  @ApiOperation({ summary: 'Add a department config to a location' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiCreatedResponse({ description: 'Department config added successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 409,
    description: 'Department already registered for this location',
  })
  addDepartment(
    @Param('locationNumber') locationNumber: string,
    @Body() dto: CreateLocationDepartmentDto,
  ) {
    this.logger.log(
      `POST /locations/${locationNumber}/departments - ${dto.department}`,
    );
    return this.locationsService.addDepartment(locationNumber, dto);
  }

  @Patch(':locationNumber/departments/:department')
  @ApiOperation({ summary: 'Update capacity or openTime for a department config' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiParam({ name: 'department', example: 'EFM' })
  @ApiResponse({ status: 200, description: 'Department config updated' })
  @ApiResponse({
    status: 404,
    description: 'Location or department config not found',
  })
  updateDepartment(
    @Param('locationNumber') locationNumber: string,
    @Param('department') department: string,
    @Body() dto: UpdateLocationDepartmentDto,
  ) {
    this.logger.log(
      `PATCH /locations/${locationNumber}/departments/${department}`,
    );
    return this.locationsService.updateDepartment(locationNumber, department, dto);
  }

  @Delete(':locationNumber/departments/:department')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a department config from a location' })
  @ApiParam({ name: 'locationNumber', example: 'A-01-01' })
  @ApiParam({ name: 'department', example: 'EFM' })
  @ApiResponse({ status: 204, description: 'Department config removed' })
  @ApiResponse({
    status: 404,
    description: 'Location or department config not found',
  })
  removeDepartment(
    @Param('locationNumber') locationNumber: string,
    @Param('department') department: string,
  ) {
    this.logger.log(
      `DELETE /locations/${locationNumber}/departments/${department}`,
    );
    return this.locationsService.removeDepartment(locationNumber, department);
  }

  @Get(':locationNumber')
  @ApiOperation({
    summary: 'Get a location and its descendants by locationNumber',
  })
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
