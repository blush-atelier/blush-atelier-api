import {
  IsUUID,
  IsInt,
  Min,
  Max,
  Matches,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class BasketItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') productId!: string;
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
}
export class QuoteDto {
  @ApiPropertyOptional({
    type: [BasketItemDto],
    description:
      'Hasta 50 productos distintos. productId y quantity deben coincidir con la primera línea; se conservan para recuperar compras anteriores.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BasketItemDto)
  items?: BasketItemDto[];
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  @IsUUID('4')
  productId!: string;
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
  @ApiProperty({
    format: 'uuid',
    description: 'ID obtenido al crear la entrega en esta sesión.',
  })
  @IsUUID('4')
  deliveryId!: string;
}
export class PendingDto extends QuoteDto {
  @ApiProperty({
    example: '10490000',
    description:
      'Total mostrado por la cotización, en centavos. El backend vuelve a calcularlo.',
  })
  @Matches(/^(0|[1-9][0-9]{0,18})$/)
  expectedTotalMinor!: string;
}
