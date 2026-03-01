import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Matches,
} from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({
    example: 'A-01-01',
    description: 'Unique location identifier',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, {
    message: 'locationNumber must be uppercase alphanumeric with hyphens',
  })
  locationNumber: string;

  @ApiProperty({ example: 'Meeting Room 1' })
  @IsString()
  @IsNotEmpty()
  locationName: string;

  @ApiProperty({ example: 'A', description: 'Building code' })
  @IsString()
  @IsNotEmpty()
  building: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID of the parent location (null for root nodes)',
  })
  @IsInt()
  @IsOptional()
  parentId?: number;
}
