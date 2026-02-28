import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'Meeting Room 1 (Renovated)' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  locationName?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  building?: string;
}
