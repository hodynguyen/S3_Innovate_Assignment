import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateLocationDepartmentDto {
  @ApiProperty({ example: 'EFM', description: 'Department code' })
  @IsString()
  @IsNotEmpty()
  department: string;

  @ApiProperty({
    example: 10,
    description: 'Max occupancy for this department at this location',
  })
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiPropertyOptional({
    example: 'Mon to Fri (9AM to 6PM)',
    description:
      'Open time window. Use "Always open" for 24/7. Omit for no restriction.',
  })
  @IsString()
  @IsOptional()
  openTime?: string;
}
