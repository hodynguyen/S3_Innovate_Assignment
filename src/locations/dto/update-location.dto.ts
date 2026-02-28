import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

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

  @ApiPropertyOptional({ example: 'EFM' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({ example: 'Mon to Sat (9AM to 6PM)' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  openTime?: string;
}
