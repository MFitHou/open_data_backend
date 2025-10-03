import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FusekiModule } from './fuseki/fuseki.module';

@Module({
  imports: [FusekiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
