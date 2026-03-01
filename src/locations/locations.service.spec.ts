import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Location } from './entities/location.entity';
import { LocationDepartment } from './entities/location-department.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateLocationDepartmentDto } from './dto/create-location-department.dto';
import { UpdateLocationDepartmentDto } from './dto/update-location-department.dto';

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

function makeCreateDeptDto(
  overrides: Partial<CreateLocationDepartmentDto> = {},
): CreateLocationDepartmentDto {
  return {
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
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

      expect(treeRepo.findTrees).toHaveBeenCalledWith({
        relations: ['departmentConfigs'],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, locationNumber: 'A' });
      expect(result[0].parent).toBeNull();
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].parent).toBeNull();
    });

    it('should return an empty array when there are no locations', async () => {
      treeRepo.findTrees.mockResolvedValue([]);

      const result = await service.findTree();

      expect(treeRepo.findTrees).toHaveBeenCalledWith({
        relations: ['departmentConfigs'],
      });
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

      expect(treeRepo.findTrees).toHaveBeenCalledWith({
        relations: ['departmentConfigs'],
      });
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
      const deptConfigs = [
        {
          id: 1,
          locationId: 1,
          department: 'EFM',
          capacity: 10,
          openTime: 'Mon to Fri (9AM to 6PM)',
        } as LocationDepartment,
      ];
      const child = makeLocation({
        id: 2,
        locationNumber: 'A-01-01-M1',
        parent: null,
        children: [],
        departmentConfigs: [],
      });
      // findDescendantsTree with relations: ['departmentConfigs'] returns nodes
      // with departmentConfigs already populated for every node in the subtree.
      const locationWithChildren = makeLocation({
        id: 1,
        parent: null,
        children: [child],
        departmentConfigs: deptConfigs,
      });

      locationRepo.findOne.mockResolvedValue(location);
      treeRepo.findDescendantsTree.mockResolvedValue(locationWithChildren);

      const result = await service.findOne('A-01-01');

      expect(result).toMatchObject({ id: 1, locationNumber: 'A-01-01' });
      expect(result.parent).toBeNull();
      expect(result.children).toHaveLength(1);
      expect(result.children[0]).toMatchObject({ id: 2 });
      expect(result.departmentConfigs).toBe(deptConfigs);
      // findDescendantsTree must be called with the relations option so all nodes
      // in the subtree — including children — have departmentConfigs loaded.
      expect(treeRepo.findDescendantsTree).toHaveBeenCalledWith(location, {
        relations: ['departmentConfigs'],
      });
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
        departmentConfigs: [],
      });

      locationRepo.findOne.mockResolvedValue(location);
      treeRepo.findDescendantsTree.mockResolvedValue(treeWithPopulatedParent);

      const result = await service.findOne('A-01-01');

      expect(result.parent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findById()
  // -------------------------------------------------------------------------

  describe('findById()', () => {
    it('should throw NotFoundException when no location matches the id', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service.findById(999).catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/location with id 999 not found/i);
    });

    it('should return the location when the id exists', async () => {
      const location = makeLocation({ id: 42, locationNumber: 'A-01' });
      locationRepo.findOne.mockResolvedValue(location);

      const result = await service.findById(42);

      expect(result).toBe(location);
      expect(locationRepo.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
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

  // -------------------------------------------------------------------------
  // findDepartments()
  // -------------------------------------------------------------------------

  describe('findDepartments()', () => {
    it('should throw NotFoundException when location does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service.findDepartments('Z-99-99').catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should return the array of department configs when location exists', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfigs = [
        makeDeptConfig({ id: 1, department: 'EFM' }),
        makeDeptConfig({ id: 2, department: 'FSS', capacity: 50 }),
      ];

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.find.mockResolvedValue(deptConfigs);

      const result = await service.findDepartments('A-01-01');

      expect(result).toBe(deptConfigs);
      expect(locationDepartmentRepo.find).toHaveBeenCalledWith({
        where: { locationId: location.id },
      });
    });

    it('should return an empty array when location has no department configs', async () => {
      const location = makeLocation({ id: 1 });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.find.mockResolvedValue([]);

      const result = await service.findDepartments('A-01-01');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // addDepartment()
  // -------------------------------------------------------------------------

  describe('addDepartment()', () => {
    it('should throw NotFoundException when location does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service
        .addDepartment('Z-99-99', makeCreateDeptDto())
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should throw ConflictException when the same department is already registered for the location', async () => {
      const location = makeLocation({ id: 1 });

      locationRepo.findOne.mockResolvedValue(location);
      // findOne on locationDepartmentRepo returns an existing row → duplicate
      locationDepartmentRepo.findOne.mockResolvedValue(makeDeptConfig());

      const error = await service
        .addDepartment('A-01-01', makeCreateDeptDto())
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/already registered/i);
      expect(error.message).toContain('EFM');
      expect(error.message).toContain('A-01-01');
    });

    it('should create and return the new department config on the happy path', async () => {
      const location = makeLocation({ id: 1 });
      const saved = makeDeptConfig({ id: 5 });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(null); // no existing row
      locationDepartmentRepo.create.mockReturnValue(saved);
      locationDepartmentRepo.save.mockResolvedValue(saved);

      const dto = makeCreateDeptDto();
      const result = await service.addDepartment('A-01-01', dto);

      expect(result).toBe(saved);
      expect(locationDepartmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: location.id,
          department: dto.department,
          capacity: dto.capacity,
        }),
      );
      expect(locationDepartmentRepo.save).toHaveBeenCalledWith(saved);
    });

    it('should store null for openTime when dto.openTime is not provided', async () => {
      const location = makeLocation({ id: 1 });
      const captured: Partial<LocationDepartment> = {};

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(null);
      locationDepartmentRepo.create.mockImplementation((data) => {
        Object.assign(captured, data);
        return captured as LocationDepartment;
      });
      locationDepartmentRepo.save.mockResolvedValue(
        captured as LocationDepartment,
      );

      const dto = makeCreateDeptDto({ openTime: undefined });
      await service.addDepartment('A-01-01', dto);

      expect(captured.openTime).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateDepartment()
  // -------------------------------------------------------------------------

  describe('updateDepartment()', () => {
    it('should throw NotFoundException when location does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const dto: UpdateLocationDepartmentDto = { capacity: 20 };
      const error = await service
        .updateDepartment('Z-99-99', 'EFM', dto)
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should throw NotFoundException when department config does not exist for the location', async () => {
      const location = makeLocation({ id: 1 });
      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(null);

      const dto: UpdateLocationDepartmentDto = { capacity: 20 };
      const error = await service
        .updateDepartment('A-01-01', 'HR', dto)
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/not registered/i);
      expect(error.message).toContain('HR');
      expect(error.message).toContain('A-01-01');
    });

    it('should update capacity when capacity is provided', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfig = makeDeptConfig({ id: 1, capacity: 10 });
      const savedConfig = makeDeptConfig({ id: 1, capacity: 25 });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(deptConfig);
      locationDepartmentRepo.save.mockResolvedValue(savedConfig);

      const dto: UpdateLocationDepartmentDto = { capacity: 25 };
      const result = await service.updateDepartment('A-01-01', 'EFM', dto);

      expect(deptConfig.capacity).toBe(25);
      expect(locationDepartmentRepo.save).toHaveBeenCalledWith(deptConfig);
      expect(result).toBe(savedConfig);
    });

    it('should update openTime when openTime is provided', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfig = makeDeptConfig({ id: 1, openTime: 'Mon to Fri (9AM to 6PM)' });
      const savedConfig = makeDeptConfig({ id: 1, openTime: 'Always open' });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(deptConfig);
      locationDepartmentRepo.save.mockResolvedValue(savedConfig);

      const dto: UpdateLocationDepartmentDto = { openTime: 'Always open' };
      const result = await service.updateDepartment('A-01-01', 'EFM', dto);

      expect(deptConfig.openTime).toBe('Always open');
      expect(locationDepartmentRepo.save).toHaveBeenCalledWith(deptConfig);
      expect(result).toBe(savedConfig);
    });

    it('should only update provided fields and leave others unchanged', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfig = makeDeptConfig({
        id: 1,
        capacity: 10,
        openTime: 'Mon to Fri (9AM to 6PM)',
      });
      const savedConfig = makeDeptConfig({
        id: 1,
        capacity: 30,
        openTime: 'Mon to Fri (9AM to 6PM)',
      });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(deptConfig);
      locationDepartmentRepo.save.mockResolvedValue(savedConfig);

      // Only capacity is provided — openTime must not change
      const dto: UpdateLocationDepartmentDto = { capacity: 30 };
      const result = await service.updateDepartment('A-01-01', 'EFM', dto);

      expect(deptConfig.capacity).toBe(30);
      expect(deptConfig.openTime).toBe('Mon to Fri (9AM to 6PM)');
      expect(locationDepartmentRepo.save).toHaveBeenCalledWith(deptConfig);
      expect(result).toBe(savedConfig);
    });

    it('should update both capacity and openTime when both are provided', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfig = makeDeptConfig({
        id: 1,
        capacity: 10,
        openTime: 'Mon to Fri (9AM to 6PM)',
      });
      const savedConfig = makeDeptConfig({
        id: 1,
        capacity: 50,
        openTime: 'Always open',
      });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(deptConfig);
      locationDepartmentRepo.save.mockResolvedValue(savedConfig);

      const dto: UpdateLocationDepartmentDto = { capacity: 50, openTime: 'Always open' };
      const result = await service.updateDepartment('A-01-01', 'EFM', dto);

      expect(deptConfig.capacity).toBe(50);
      expect(deptConfig.openTime).toBe('Always open');
      expect(result).toBe(savedConfig);
    });
  });

  // -------------------------------------------------------------------------
  // removeDepartment()
  // -------------------------------------------------------------------------

  describe('removeDepartment()', () => {
    it('should throw NotFoundException when location does not exist', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      const error = await service
        .removeDepartment('Z-99-99', 'EFM')
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/'Z-99-99' not found/i);
    });

    it('should throw NotFoundException when the department config does not exist for the location', async () => {
      const location = makeLocation({ id: 1 });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(null); // dept config missing

      const error = await service
        .removeDepartment('A-01-01', 'HR')
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toMatch(/not registered/i);
      expect(error.message).toContain('HR');
      expect(error.message).toContain('A-01-01');
    });

    it('should remove the department config and resolve void on success', async () => {
      const location = makeLocation({ id: 1 });
      const deptConfig = makeDeptConfig({ id: 3, department: 'EFM' });

      locationRepo.findOne.mockResolvedValue(location);
      locationDepartmentRepo.findOne.mockResolvedValue(deptConfig);
      locationDepartmentRepo.remove.mockResolvedValue(undefined);

      const result = await service.removeDepartment('A-01-01', 'EFM');

      expect(locationDepartmentRepo.remove).toHaveBeenCalledWith(deptConfig);
      expect(result).toBeUndefined();
    });
  });
});
