import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Location } from './location.entity';

@Entity('location_department')
@Unique(['locationId', 'department'])
export class LocationDepartment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Location, (location) => location.departmentConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column()
  locationId: number;

  @Column({ type: 'varchar' })
  department: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'varchar', nullable: true })
  openTime: string | null;
}
