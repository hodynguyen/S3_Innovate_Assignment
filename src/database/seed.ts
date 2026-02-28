/**
 * Seed script: populates the database with sample data from the assignment table.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/database/seed.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Location } from '../locations/entities/location.entity';
import { config } from 'dotenv';

config(); // load .env

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'password',
  database: process.env.DB_NAME ?? 's3_innovate',
  entities: [Location],
  synchronize: true,
});

interface LocationSeed {
  locationNumber: string;
  locationName: string;
  building: string;
  parentNumber?: string;
  department?: string;
  capacity?: number;
  openTime?: string;
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
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
  },
  {
    locationNumber: 'A-01-02',
    locationName: 'Meeting Room 2',
    building: 'A',
    parentNumber: 'A-01',
    department: 'FSS',
    capacity: 50,
    openTime: 'Mon to Fri (9AM to 6PM)',
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
    department: 'ASS',
    capacity: 30,
    openTime: 'Always open',
  },
  {
    locationNumber: 'B-05-12',
    locationName: 'Sanitary Room',
    building: 'B',
    parentNumber: 'B-05',
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
  },
  {
    locationNumber: 'B-05-13',
    locationName: 'Meeting Toilet',
    building: 'B',
    parentNumber: 'B-05',
    department: 'EFM',
    capacity: 10,
    openTime: 'Mon to Fri (9AM to 6PM)',
  },
  {
    locationNumber: 'B-05-14',
    locationName: 'Genset Room',
    building: 'B',
    parentNumber: 'B-05',
    department: 'ASS',
    capacity: 100,
    openTime: 'Mon to Sun (9AM to 6PM)',
  },
];

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getTreeRepository(Location);

  console.log('Clearing existing locations...');
  await AppDataSource.query('DELETE FROM location');

  // First pass: create all locations without parents
  const locationMap = new Map<string, Location>();
  for (const data of SEED_DATA) {
    const loc = repo.create({
      locationNumber: data.locationNumber,
      locationName: data.locationName,
      building: data.building,
      department: data.department ?? null,
      capacity: data.capacity ?? null,
      openTime: data.openTime ?? null,
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

  console.log('\nSeed completed successfully.');
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
