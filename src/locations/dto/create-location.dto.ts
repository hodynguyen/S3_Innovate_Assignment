import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'A-01-01', description: 'Unique location identifier' })
  @IsString()
  @IsNotEmpty()
  locationNumber: string;

  @ApiProperty({ example: 'Meeting Room 1' })
  @IsString()
  @IsNotEmpty()
  locationName: string;

  @ApiProperty({ example: 'A', description: 'Building code' })
  @IsString()
  @IsNotEmpty()
  building: string;

  @ApiPropertyOptional({ example: 'EFM', description: 'Owning department' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ example: 10, description: 'Max occupancy' })
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    example: 'Mon to Fri (9AM to 6PM)',
    description: 'Open time window. Use "Always open" for 24/7.',
  })
  @IsString()
  @IsOptional()
  openTime?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID of the parent location (null for root nodes)',
  })
  @IsNumber()
  @IsOptional()
  parentId?: number;
}
