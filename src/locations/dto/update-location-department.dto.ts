import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLocationDepartmentDto {
  @ApiPropertyOptional({
    example: 25,
    description: 'Maximum number of attendees',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;

  @ApiPropertyOptional({
    example: 'Mon to Fri (9AM to 6PM)',
    description: 'Open time window string',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  openTime?: string;
}
