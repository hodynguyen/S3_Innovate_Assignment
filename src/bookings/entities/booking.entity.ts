import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Location } from '../../locations/entities/location.entity';

@Entity('booking')
@Index(['locationId', 'startTime', 'endTime'])
@Index(['createdAt'])
export class Booking {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @ApiProperty({ example: 42 })
  @Column({ name: 'locationId' })
  locationId: number;

  @ApiProperty({ example: 'EFM' })
  @Column()
  department: string;

  @ApiProperty({ example: 10 })
  @Column({ type: 'int' })
  attendees: number;

  @ApiProperty({ example: '2026-03-10T09:00:00.000Z' })
  @Column({ type: 'timestamptz' })
  startTime: Date;

  @ApiProperty({ example: '2026-03-10T17:00:00.000Z' })
  @Column({ type: 'timestamptz' })
  endTime: Date;

  @ApiProperty({ example: '2026-03-01T12:00:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;
}
