import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    example: 'A-01-01',
    description: 'locationNumber of the room to book',
  })
  @IsString()
  @IsNotEmpty()
  locationNumber: string;

  @ApiProperty({ example: 'EFM', description: 'Department making the booking' })
  @IsString()
  @IsNotEmpty()
  department: string;

  @ApiProperty({ example: 8, description: 'Number of attendees' })
  @IsInt()
  @Min(1)
  attendees: number;

  @ApiProperty({
    example: '2026-03-10T09:00:00Z',
    description: 'Booking start time (ISO 8601)',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    example: '2026-03-10T11:00:00Z',
    description: 'Booking end time (ISO 8601)',
  })
  @IsDateString()
  endTime: string;
}
