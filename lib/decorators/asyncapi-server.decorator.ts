import { createClassDecorator } from '@nestjs/swagger/dist/decorators/helpers';
import { DECORATORS } from '../asyncapi.constants';
import { AsyncServerObject } from '../interface';

export function AsyncApiServer(
  ...options: (AsyncServerObject & { name: string })[]
) {
  return (target) => {
    return createClassDecorator(DECORATORS.AsyncApiServer, options)(target);
  };
}
