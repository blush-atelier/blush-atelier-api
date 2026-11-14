import { IsString, Length, Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class DeliveryDto {
  @ApiProperty({ example: 'Ana Prueba' })
  @IsString()
  @Length(2, 120)
  recipientName!: string;
  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @Length(7, 30)
  recipientPhone!: string;
  @ApiProperty({ example: 'Calle 10 # 20-30' })
  @IsString()
  @Length(5, 250)
  addressLine!: string;
  @ApiProperty({ example: 'Bogotá' }) @IsString() @Length(2, 100) city!: string;
  @ApiProperty({ example: 'Bogotá D.C.' })
  @IsString()
  @Length(2, 100)
  region!: string;
  @ApiProperty({ example: 'CO' }) @Equals('CO') countryCode!: string;
}
