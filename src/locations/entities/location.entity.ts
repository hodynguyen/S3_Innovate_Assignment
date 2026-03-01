import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationDepartment } from './location-department.entity';

@Entity('location')
@Tree('closure-table')
export class Location {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'A-01-01' })
  @Column({ unique: true })
  locationNumber: string;

  @ApiProperty({ example: 'Meeting Room 1' })
  @Column()
  locationName: string;

  @ApiProperty({ example: 'A' })
  @Column()
  building: string;

  @ApiPropertyOptional({ type: () => Location, nullable: true })
  @TreeParent({ onDelete: 'CASCADE' })
  parent: Location | null;

  @ApiPropertyOptional({ type: () => [Location] })
  @TreeChildren({ cascade: true })
  children: Location[];

  @ApiPropertyOptional({ type: () => [LocationDepartment] })
  @OneToMany(() => LocationDepartment, (dc) => dc.location)
  departmentConfigs: LocationDepartment[];

  @ApiProperty({ example: '2026-03-01T12:00:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2026-03-01T12:00:00.000Z' })
  @UpdateDateColumn()
  updatedAt: Date;
}
