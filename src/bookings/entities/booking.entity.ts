import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Location } from '../../locations/entities/location.entity';

@Entity('booking')
@Index(['locationId', 'startTime', 'endTime'])
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Location, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column({ name: 'locationId' })
  locationId: number;

  @Column()
  department: string;

  @Column({ type: 'int' })
  attendees: number;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
