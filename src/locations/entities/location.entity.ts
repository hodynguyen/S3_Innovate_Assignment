import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { LocationDepartment } from './location-department.entity';

@Entity('location')
@Tree('closure-table')
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ unique: true })
  locationNumber: string;

  @Column()
  locationName: string;

  @Column()
  building: string;

  @TreeParent({ onDelete: 'CASCADE' })
  parent: Location | null;

  @TreeChildren({ cascade: true })
  children: Location[];

  @OneToMany(() => LocationDepartment, (dc) => dc.location)
  departmentConfigs: LocationDepartment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
