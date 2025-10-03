import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FusekiService } from './fuseki.service';
import { FusekiController } from './fuseki.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [FusekiService],
  controllers: [FusekiController],
  exports: [FusekiService],
})
export class FusekiModule {}