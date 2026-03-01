import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  MaxLength,
  IsDateString,
  Matches,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    example: 'A-01-01',
    description: 'locationNumber of the room to book',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, {
    message: 'locationNumber must be uppercase alphanumeric with hyphens',
  })
  locationNumber: string;

  @ApiProperty({ example: 'EFM', description: 'Department making the booking' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
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
