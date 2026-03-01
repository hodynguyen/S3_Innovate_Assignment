import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidOpenTimeFormat } from '../../common/validators/is-valid-open-time-format.validator';

export class UpdateLocationDepartmentDto {
  @ApiPropertyOptional({
    example: 25,
    description: 'Maximum number of attendees',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    example: 'Mon to Fri (9AM to 6PM)',
    description: 'Open time window string',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsValidOpenTimeFormat()
  openTime?: string;
}
