import { ApiProperty } from '@nestjs/swagger';
export class ResourceIdDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
