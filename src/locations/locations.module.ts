import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Location } from './entities/location.entity';
import { LocationDepartment } from './entities/location-department.entity';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Location, LocationDepartment])],
  controllers: [LocationsController],
  providers: [
    LocationsService,
    {
      provide: 'LOCATION_TREE_REPO',
      useFactory: (dataSource: DataSource) =>
        dataSource.getTreeRepository(Location),
      inject: [DataSource],
    },
  ],
  exports: [LocationsService],
})
export class LocationsModule {}
