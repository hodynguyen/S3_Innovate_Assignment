import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { parseOpenTime } from '../utils/open-time.parser';

@ValidatorConstraint({ name: 'isValidOpenTimeFormat', async: false })
export class IsValidOpenTimeFormatConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      parseOpenTime(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return `openTime must be "Always open" or match the pattern "Mon to Fri (9AM to 6PM)"`;
  }
}

export function IsValidOpenTimeFormat(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidOpenTimeFormatConstraint,
    });
  };
}
