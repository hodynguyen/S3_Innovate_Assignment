import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Location } from './location.entity';

@Entity('location_department')
@Unique(['locationId', 'department'])
export class LocationDepartment {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Location, (location) => location.departmentConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @ApiProperty({ example: 42 })
  @Column()
  locationId: number;

  @ApiProperty({ example: 'EFM' })
  @Column({ type: 'varchar' })
  department: string;

  @ApiProperty({ example: 20 })
  @Column({ type: 'int' })
  capacity: number;

  @ApiPropertyOptional({ example: 'Mon to Fri (9AM to 6PM)', nullable: true })
  @Column({ type: 'varchar', nullable: true })
  openTime: string | null;
}
