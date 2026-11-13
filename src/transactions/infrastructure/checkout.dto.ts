import { IsUUID, IsInt, Min, Max, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class QuoteDto {
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
