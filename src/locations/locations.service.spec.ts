import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { TreeRepository } from 'typeorm';
import { LocationsService } from './locations.service';
import { Location } from './entities/location.entity';
import { LocationDepartment } from './entities/location-department.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

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

function makeCreateDto(
  overrides: Partial<CreateLocationDto> = {},
): CreateLocationDto {
  return {
    locationNumber: 'A-01-01',
    locationName: 'Meeting Room 1',
    building: 'A',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock repository factories
// ---------------------------------------------------------------------------

function makeLocationRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
}

function makeLocationTreeRepo() {
  return {
    findTrees: jest.fn(),
    findDescendantsTree: jest.fn(),
  };
}

function makeLocationDepartmentRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocationsService', () => {
  let service: LocationsService;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let treeRepo: ReturnType<typeof makeLocationTreeRepo>;
  let locationDepartmentRepo: ReturnType<typeof makeLocationDepartmentRepo>;

  beforeEach(async () => {
    locationRepo = makeLocationRepo();
    treeRepo = makeLocationTreeRepo();
    locationDepartmentRepo = makeLocationDepartmentRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: getRepositoryToken(Location),
          useValue: locationRepo,
        },
        {
          provide: 'LOCATION_TREE_REPO',
          useValue: treeRepo,
        },
        {
          provide: getRepositoryToken(LocationDepartment),
          useValue: locationDepartmentRepo,
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    module.get<TreeRepository<Location>>('LOCATION_TREE_REPO');
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('should throw ConflictException when locationNumber already exists', async () => {
      locationRepo.findOne.mockResolvedValueOnce(makeLocation());

      const error = await service.create(makeCreateDto()).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/already exists/i);
    });

    it('should throw NotFoundException when parentId is provided but parent does not exist', async () => {
      // First findOne (uniqueness check) → null (no duplicate)
      // Second findOne (parent lookup) → null (parent not found)
      locationRepo.findOne
        .mockResolvedValueOnce(null) // uniqueness check passes
        .mockResolvedValueOnce(null); // parent lookup fails

      locationRepo.create.mockReturnValue(makeLocation());

      const dto = makeCreateDto({ parentId: 999 });
      const error = await service.create(dto).catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/parent location/i);
    });

    it('should save and return the location when no parentId is given', async () => {
      locationRepo.findOne.mockResolvedValueOnce(null); // no duplicate
      const newLocation = makeLocation();
      locationRepo.create.mockReturnValue(newLocation);
      locationRepo.save.mockResolvedValue(newLocation);

      const result = await service.create(makeCreateDto());

      expect(result).toBe(newLocation);
      expect(locationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ locationNumber: 'A-01-01' }),
      );
      expect(locationRepo.save).toHaveBeenCalledWith(newLocation);
    });

    it('should attach the parent and save when a valid parentId is given', async () => {
      const parentLocation = makeLocation({ id: 10, locationNumber: 'A-01' });
      const childLocation = makeLocation({ id: 2, locationNumber: 'A-01-01' });

      locationRepo.findOne
        .mockResolvedValueOnce(null) // uniqueness check passes
        .mockResolvedValueOnce(parentLocation); // parent found

      locationRepo.create.mockReturnValue(childLocation);
      locationRepo.save.mockResolvedValue(childLocation);

      const dto = makeCreateDto({ parentId: 10 });
      const result = await service.create(dto);

      expect(result).toBe(childLocation);
      // The service should have set location.parent = parentLocation before saving
      expect(childLocation.parent).toBe(parentLocation);
      expect(locationRepo.save).toHaveBeenCalledWith(childLocation);
    });

    it('should not pass department, capacity, or openTime when creating a location', async () => {
      locationRepo.findOne.mockResolvedValueOnce(null);
      const created: Partial<Location> = {};
      locationRepo.create.mockImplementation((data) => {
        Object.assign(created, data);
        return created as Location;
      });
      locationRepo.save.mockResolvedValue(created as Location);

      await service.create(makeCreateDto());

      // These fields were removed from the entity and should not appear in create payload
      expect(created).not.toHaveProperty('department');
      expect(created).not.toHaveProperty('capacity');
      expect(created).not.toHaveProperty('openTime');
    });
  });

  // -------------------------------------------------------------------------
  // findTree()
  // -------------------------------------------------------------------------

  describe('findTree()', () => {
    it('should return root nodes with nested children and parent nulled', async () => {
      const child = makeLocation({
        id: 2,
        locationNumber: 'A-01',
        parent: null,
        children: [],
      });
      const root = makeLocation({
        id: 1,
        locationNumber: 'A',
        parent: null,
        children: [child],
      });

      treeRepo.findTrees.mockResolvedValue([root]);

      const result = await service.findTree();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, locationNumber: 'A' });
      expect(result[0].parent).toBeNull();
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].parent).toBeNull();
    });

    it('should return an empty array when there are no locations', async () => {
      treeRepo.findTrees.mockResolvedValue([]);

      const result = await service.findTree();

      expect(result).toEqual([]);
    });

    it('should nullify parents at every level of a deeply nested tree', async () => {
      // Build a 3-level tree: root → child → grandchild
      // TypeORM's findTrees can return nodes with parent references populated;
      // nullifyParents() must recurse and clear them all.
      const grandchild = makeLocation({
        id: 3,
        locationNumber: 'A-01-01',
        parent: makeLocation({ id: 2, locationNumber: 'A-01' }), // non-null parent
        children: [],
      });
      const child = makeLocation({
        id: 2,
        locationNumber: 'A-01',
        parent: makeLocation({ id: 1, locationNumber: 'A' }), // non-null parent
        children: [grandchild],
      });
      const root = makeLocation({
        id: 1,
        locationNumber: 'A',
        parent: null,
        children: [child],
      });

      treeRepo.findTrees.mockResolvedValue([root]);

      const result = await service.findTree();

      expect(result[0].parent).toBeNull();
      expect(result[0].children[0].parent).toBeNull();
      expect(result[0].children[0].children[0].parent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('should throw NotFoundException when location does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service.findOne('Z-99-99').catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should return the node with its children and departmentConfigs when location exists', async () => {
      const location = makeLocation({ id: 1 });
      const child = makeLocation({
        id: 2,
        locationNumber: 'A-01-01-M1',
        parent: null,
        children: [],
      });
      const locationWithChildren = makeLocation({
        id: 1,
        parent: null,
        children: [child],
      });
      const deptConfigs = [
        {
          id: 1,
          locationId: 1,
          department: 'EFM',
          capacity: 10,
          openTime: 'Mon to Fri (9AM to 6PM)',
        } as LocationDepartment,
      ];

      locationRepo.findOne.mockResolvedValue(location);
      treeRepo.findDescendantsTree.mockResolvedValue(locationWithChildren);
      locationDepartmentRepo.find.mockResolvedValue(deptConfigs);

      const result = await service.findOne('A-01-01');

      expect(result).toMatchObject({ id: 1, locationNumber: 'A-01-01' });
      expect(result.parent).toBeNull();
      expect(result.children).toHaveLength(1);
      expect(result.children[0]).toMatchObject({ id: 2 });
      expect(result.departmentConfigs).toBe(deptConfigs);
    });

    it('should nullify the parent on the tree root returned by findDescendantsTree', async () => {
      // TypeORM's findDescendantsTree may return the root node with its parent
      // field still populated. The service must explicitly set tree.parent = null.
      const location = makeLocation({ id: 1 });
      const parentLocation = makeLocation({ id: 0, locationNumber: 'A' });
      const treeWithPopulatedParent = makeLocation({
        id: 1,
        parent: parentLocation, // non-null — simulate TypeORM returning it
        children: [],
      });

      locationRepo.findOne.mockResolvedValue(location);
      treeRepo.findDescendantsTree.mockResolvedValue(treeWithPopulatedParent);
      locationDepartmentRepo.find.mockResolvedValue([]);

      const result = await service.findOne('A-01-01');

      expect(result.parent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe('update()', () => {
    it('should throw NotFoundException when location to update does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const dto: UpdateLocationDto = { locationName: 'New Name' };
      const error = await service.update('Z-99-99', dto).catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should apply partial updates and return the saved location', async () => {
      const existing = makeLocation();
      locationRepo.findOne.mockResolvedValue(existing);

      const updated = makeLocation({ locationName: 'Renamed Room' });
      locationRepo.save.mockResolvedValue(updated);

      const dto: UpdateLocationDto = { locationName: 'Renamed Room' };
      const result = await service.update('A-01-01', dto);

      expect(result).toBe(updated);
      // Object.assign is used in the service — verify it was called with the dto values
      expect(existing.locationName).toBe('Renamed Room');
      expect(locationRepo.save).toHaveBeenCalledWith(existing);
    });
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  describe('remove()', () => {
    it('should throw NotFoundException when location to remove does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service.remove('Z-99-99').catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should call locationRepo.remove() with the found location', async () => {
      const location = makeLocation();
      locationRepo.findOne.mockResolvedValueOnce(location);
      locationRepo.remove.mockResolvedValue(undefined);

      await service.remove('A-01-01');

      expect(locationRepo.remove).toHaveBeenCalledWith(location);
    });

    it('should resolve without returning a value (void) on success', async () => {
      locationRepo.findOne.mockResolvedValueOnce(makeLocation());
      locationRepo.remove.mockResolvedValue(undefined);

      const result = await service.remove('A-01-01');
      expect(result).toBeUndefined();
    });
  });
});
