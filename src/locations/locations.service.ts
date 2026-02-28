import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
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
      department: dto.department ?? null,
      capacity: dto.capacity ?? null,
      openTime: dto.openTime ?? null,
    });

    if (dto.parentId) {
      const parent = await this.locationRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent location with id ${dto.parentId} not found`);
      }
      location.parent = parent;
    }

    const saved = await this.locationRepo.save(location);
    this.logger.log(`Location created: ${saved.locationNumber} (id=${saved.id})`);
    return saved;
  }

  async findTree(): Promise<Location[]> {
    this.logger.log('Fetching full location tree');
    const all = await this.locationRepo.find({ relations: ['parent'] });
    const map = new Map(all.map((l) => [l.id, l]));
    for (const loc of all) loc.children = [];
    const roots: Location[] = [];
    for (const loc of all) {
      if (loc.parent) {
        map.get(loc.parent.id)?.children.push(loc);
        loc.parent = null;
      } else {
        roots.push(loc);
      }
    }
    return roots;
  }

  async findOne(locationNumber: string): Promise<Location> {
    const location = await this.locationRepo.findOne({
      where: { locationNumber },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationNumber}' not found`);
    }
    const all = await this.locationRepo.find({ relations: ['parent'] });
    const node = all.find((l) => l.id === location.id)!;
    return this.buildSubtree(all, node);
  }

  private buildSubtree(all: Location[], node: Location): Location {
    node.children = all
      .filter((l) => l.parent?.id === node.id)
      .map((l) => this.buildSubtree(all, l));
    node.parent = null;
    return node;
  }

  async findById(id: number): Promise<Location> {
    const location = await this.locationRepo.findOne({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location with id ${id} not found`);
    }
    return location;
  }

  async update(locationNumber: string, dto: UpdateLocationDto): Promise<Location> {
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
}
