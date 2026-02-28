import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'Meeting Room 1 (Renovated)' })
  @IsString()
  @IsOptional()
  locationName?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsString()
  @IsOptional()
  building?: string;

  @ApiPropertyOptional({ example: 'EFM' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({ example: 'Mon to Sat (9AM to 6PM)' })
  @IsString()
  @IsOptional()
  openTime?: string;
}
