import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository } from 'typeorm';
import { Location } from './entities/location.entity';
import { LocationDepartment } from './entities/location-department.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateLocationDepartmentDto } from './dto/create-location-department.dto';
import { UpdateLocationDepartmentDto } from './dto/update-location-department.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @Inject('LOCATION_TREE_REPO')
    private readonly treeRepo: TreeRepository<Location>,
    @InjectRepository(LocationDepartment)
    private readonly locationDepartmentRepo: Repository<LocationDepartment>,
  ) {}

  async create(dto: CreateLocationDto): Promise<Location> {
    this.logger.log(`Creating location: ${dto.locationNumber}`);

    const existing = await this.locationRepo.findOne({
      where: { locationNumber: dto.locationNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Location number '${dto.locationNumber}' already exists`,
      );
    }

    const location = this.locationRepo.create({
      locationNumber: dto.locationNumber,
      locationName: dto.locationName,
      building: dto.building,
    });

    if (dto.parentId) {
      const parent = await this.locationRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent location with id ${dto.parentId} not found`,
        );
      }
      location.parent = parent;
    }

    const saved = await this.locationRepo.save(location);
    this.logger.log(
      `Location created: ${saved.locationNumber} (id=${saved.id})`,
    );
    return saved;
  }

  async findTree(): Promise<Location[]> {
    this.logger.log('Fetching full location tree');
    const trees = await this.treeRepo.findTrees({
      relations: ['departmentConfigs'],
    });
    this.nullifyParents(trees);
    return trees;
  }

  async findOne(locationNumber: string): Promise<Location> {
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }
    const tree = await this.treeRepo.findDescendantsTree(location, {
      relations: ['departmentConfigs'],
    });
    tree.parent = null;
    return tree;
  }

  private nullifyParents(nodes: Location[]): void {
    for (const node of nodes) {
      node.parent = null;
      if (node.children?.length) this.nullifyParents(node.children);
    }
  }

  async findById(id: number): Promise<Location> {
    const location = await this.locationRepo.findOne({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location with id ${id} not found`);
    }
    return location;
  }

  async update(
    locationNumber: string,
    dto: UpdateLocationDto,
  ): Promise<Location> {
    this.logger.log(`Updating location: ${locationNumber}`);
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }

    // Only apply fields that were explicitly provided in the PATCH body.
    // Omitting undefined values prevents overwriting existing fields with NULL.
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    Object.assign(location, patch);
    const updated = await this.locationRepo.save(location);
    this.logger.log(`Location updated: ${updated.locationNumber}`);
    return updated;
  }

  async remove(locationNumber: string): Promise<void> {
    this.logger.log(`Removing location: ${locationNumber}`);
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }
    await this.locationRepo.remove(location);
    this.logger.log(`Location removed: ${locationNumber}`);
  }

  // ---------------------------------------------------------------------------
  // Department config sub-resource
  // ---------------------------------------------------------------------------

  async findDepartments(locationNumber: string): Promise<LocationDepartment[]> {
    this.logger.log(`Fetching departments for location: ${locationNumber}`);
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }
    return this.locationDepartmentRepo.find({
      where: { locationId: location.id },
    });
  }

  async addDepartment(
    locationNumber: string,
    dto: CreateLocationDepartmentDto,
  ): Promise<LocationDepartment> {
    this.logger.log(
      `Adding department '${dto.department}' to location: ${locationNumber}`,
    );
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }

    const existing = await this.locationDepartmentRepo.findOne({
      where: { locationId: location.id, department: dto.department },
    });
    if (existing) {
      throw new ConflictException(
        `Department '${dto.department}' is already registered for location '${locationNumber}'`,
      );
    }

    const deptConfig = this.locationDepartmentRepo.create({
      locationId: location.id,
      department: dto.department,
      capacity: dto.capacity,
      openTime: dto.openTime ?? null,
    });

    const saved = await this.locationDepartmentRepo.save(deptConfig);
    this.logger.log(
      `Department '${dto.department}' added to location '${locationNumber}' (id=${saved.id})`,
    );
    return saved;
  }

  async updateDepartment(
    locationNumber: string,
    department: string,
    dto: UpdateLocationDepartmentDto,
  ): Promise<LocationDepartment> {
    this.logger.log(
      `Updating department '${department}' for location: ${locationNumber}`,
    );
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }

    const deptConfig = await this.locationDepartmentRepo.findOne({
      where: { locationId: location.id, department },
    });
    if (!deptConfig) {
      throw new NotFoundException(
        `Department '${department}' is not registered for location '${locationNumber}'`,
      );
    }

    if (dto.capacity !== undefined) {
      deptConfig.capacity = dto.capacity;
    }
    if (dto.openTime !== undefined) {
      deptConfig.openTime = dto.openTime;
    }

    const saved = await this.locationDepartmentRepo.save(deptConfig);
    this.logger.log(
      `Department '${department}' updated for location '${locationNumber}'`,
    );
    return saved;
  }

  async removeDepartment(
    locationNumber: string,
    department: string,
  ): Promise<void> {
    this.logger.log(
      `Removing department '${department}' from location: ${locationNumber}`,
    );
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }

    const deptConfig = await this.locationDepartmentRepo.findOne({
      where: { locationId: location.id, department },
    });
    if (!deptConfig) {
      throw new NotFoundException(
        `Department '${department}' is not registered for location '${locationNumber}'`,
      );
    }

    await this.locationDepartmentRepo.remove(deptConfig);
    this.logger.log(
      `Department '${department}' removed from location '${locationNumber}'`,
    );
  }
}
