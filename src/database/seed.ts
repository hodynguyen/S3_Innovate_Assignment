/**
 * Seed script: populates the database with sample data from the assignment table.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/database/seed.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Location } from '../locations/entities/location.entity';
import { LocationDepartment } from '../locations/entities/location-department.entity';
import { config } from 'dotenv';

config(); // load .env

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'password',
  database: process.env.DB_NAME ?? 's3_innovate',
  entities: [Location, LocationDepartment],
  synchronize: true,
});

interface DepartmentConfigSeed {
  department: string;
  capacity: number;
  openTime?: string;
}

interface LocationSeed {
  locationNumber: string;
  locationName: string;
  building: string;
  parentNumber?: string;
  departmentConfigs?: DepartmentConfigSeed[];
}

const SEED_DATA: LocationSeed[] = [
  // Building A root
  { locationNumber: 'A', locationName: 'Building A', building: 'A' },

  // Floor A-01
  {
    locationNumber: 'A-01',
    locationName: 'Floor 1',
    building: 'A',
    parentNumber: 'A',
  },
  {
    locationNumber: 'A-01-Lobby',
    locationName: 'Lobby Level 1',
    building: 'A',
    parentNumber: 'A-01',
  },
  {
    locationNumber: 'A-01-Corridor',
    locationName: 'Corridor Floor 1',
    building: 'A',
    parentNumber: 'A-01',
  },
  {
    locationNumber: 'A-01-01',
    locationName: 'Meeting Room 1',
    building: 'A',
    parentNumber: 'A-01',
    departmentConfigs: [
      { department: 'EFM', capacity: 10, openTime: 'Mon to Fri (9AM to 6PM)' },
    ],
  },
  {
    locationNumber: 'A-01-02',
    locationName: 'Meeting Room 2',
    building: 'A',
    parentNumber: 'A-01',
    departmentConfigs: [
      { department: 'FSS', capacity: 50, openTime: 'Mon to Fri (9AM to 6PM)' },
    ],
  },

  // Sub-rooms under A-01-01
  {
    locationNumber: 'A-01-01-M1',
    locationName: 'Sub-room M1',
    building: 'A',
    parentNumber: 'A-01-01',
  },
  {
    locationNumber: 'A-01-01-M2',
    locationName: 'Sub-room M2',
    building: 'A',
    parentNumber: 'A-01-01',
  },

  // CarPark
  {
    locationNumber: 'A-CarPark',
    locationName: 'Car Park',
    building: 'A',
    parentNumber: 'A',
  },

  // Building B root
  { locationNumber: 'B', locationName: 'Building B', building: 'B' },

  // Floor B-05
  {
    locationNumber: 'B-05',
    locationName: 'Floor 5',
    building: 'B',
    parentNumber: 'B',
  },
  {
    locationNumber: 'B-05-Corridor',
    locationName: 'Corridor Floor 5',
    building: 'B',
    parentNumber: 'B-05',
  },
  {
    locationNumber: 'B-05-15',
    locationName: 'Pantry Floor 5',
    building: 'B',
    parentNumber: 'B-05',
  },
  {
    locationNumber: 'B-05-11',
    locationName: 'Utility Room',
    building: 'B',
    parentNumber: 'B-05',
    departmentConfigs: [
      { department: 'ASS', capacity: 30, openTime: 'Always open' },
    ],
  },
  {
    locationNumber: 'B-05-12',
    locationName: 'Sanitary Room',
    building: 'B',
    parentNumber: 'B-05',
    departmentConfigs: [
      { department: 'EFM', capacity: 10, openTime: 'Mon to Fri (9AM to 6PM)' },
    ],
  },
  {
    locationNumber: 'B-05-13',
    locationName: 'Meeting Toilet',
    building: 'B',
    parentNumber: 'B-05',
    departmentConfigs: [
      { department: 'EFM', capacity: 10, openTime: 'Mon to Fri (9AM to 6PM)' },
    ],
  },
  {
    locationNumber: 'B-05-14',
    locationName: 'Genset Room',
    building: 'B',
    parentNumber: 'B-05',
    departmentConfigs: [
      { department: 'ASS', capacity: 100, openTime: 'Mon to Sun (9AM to 6PM)' },
    ],
  },
];

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getTreeRepository(Location);
  const deptRepo = AppDataSource.getRepository(LocationDepartment);

  console.log('Clearing existing data...');
  await AppDataSource.query('DELETE FROM location_department');
  await AppDataSource.query('DELETE FROM location_closure');
  await AppDataSource.query('DELETE FROM location');

  // First pass: create all locations without parents
  const locationMap = new Map<string, Location>();
  for (const data of SEED_DATA) {
    const loc = repo.create({
      locationNumber: data.locationNumber,
      locationName: data.locationName,
      building: data.building,
    });
    const saved = await repo.save(loc);
    locationMap.set(data.locationNumber, saved);
    console.log(`Created: ${data.locationNumber} — ${data.locationName}`);
  }

  // Second pass: assign parents
  for (const data of SEED_DATA) {
    if (!data.parentNumber) continue;
    const loc = locationMap.get(data.locationNumber)!;
    const parent = locationMap.get(data.parentNumber);
    if (!parent) {
      console.warn(
        `Parent not found: ${data.parentNumber} for ${data.locationNumber}`,
      );
      continue;
    }
    loc.parent = parent;
    await repo.save(loc);
    console.log(
      `Linked: ${data.locationNumber} → parent: ${data.parentNumber}`,
    );
  }

  // Third pass: insert LocationDepartment rows
  for (const data of SEED_DATA) {
    if (!data.departmentConfigs?.length) continue;
    const loc = locationMap.get(data.locationNumber)!;
    for (const cfg of data.departmentConfigs) {
      const deptConfig = deptRepo.create({
        locationId: loc.id,
        department: cfg.department,
        capacity: cfg.capacity,
        openTime: cfg.openTime ?? null,
      });
      await deptRepo.save(deptConfig);
      console.log(
        `Dept config: ${data.locationNumber} → ${cfg.department} (cap=${cfg.capacity})`,
      );
    }
  }

  console.log('\nSeed completed successfully.');
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
