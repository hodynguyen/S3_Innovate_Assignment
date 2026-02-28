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
} from 'typeorm';

@Entity('location')
@Tree('adjacency-list')
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

  @Column({ nullable: true, type: 'varchar' })
  department: string | null;

  @Column({ nullable: true, type: 'int' })
  capacity: number | null;

  @Column({ nullable: true, type: 'varchar' })
  openTime: string | null;

  @TreeParent({ onDelete: 'CASCADE' })
  parent: Location | null;

  @TreeChildren({ cascade: true })
  children: Location[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
