/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */



/**
 * ChatToolsRegistry
 * 
 * Registry quản lý các "chat tools" được đánh dấu bằng decorator @ChatTool trong hệ thống NestJS.
 * 
 * - Tự động quét tất cả các providers/controllers để tìm các method có decorator @ChatTool.
 * - Lưu metadata schema của từng tool để phục vụ tích hợp với Google Generative AI hoặc các hệ thống LLM khác.
 * - Cho phép thực thi tool theo tên, truyền tham số động.
 * - Được sử dụng để mở rộng khả năng của chatbot, cho phép gọi các hàm nghiệp vụ từ AI.
 * 
 * Quy trình hoạt động:
 * 1. Khi khởi tạo module, tự động quét và đăng ký các tool.
 * 2. Lưu schema và tham chiếu thực thi vào map.
 * 3. Cho phép thực thi tool theo tên từ bất kỳ đâu trong hệ thống.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { CHAT_TOOL_METADATA } from '../common/decorators/chat-tools.decorator';
import { FunctionDeclaration } from '@google/generative-ai';

@Injectable()
export class ChatToolsRegistry implements OnModuleInit {
  // Danh sách schema
  public toolsSchema: FunctionDeclaration[] = [];

  // Map để lưu tham chiếu thực thi: 'tool_name' => { instance, methodName }
  private toolsMap = new Map<string, { instance: any; methodName: string }>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    this.discoverTools();
  }

  private discoverTools() {
    //Lấy tất cả các controllers và providers trong ứng dụng
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();

    [...providers, ...controllers].forEach((wrapper) => {
      const { instance } = wrapper;

      // Bỏ qua nếu instance không tồn tại (hoặc chưa khởi tạo)
      if (!instance || typeof instance !== 'object') return;

      //Quét tất cả các method trong instance đó
      const methodNames = this.metadataScanner.getAllMethodNames(
        Object.getPrototypeOf(instance),
      );

      methodNames.forEach((methodName) => {
        const methodRef = instance[methodName];

        //Kiểm tra xem method có được gắn @ChatTool không
        const metadata = this.reflector.get(CHAT_TOOL_METADATA, methodRef);

        if (metadata) {
          this.toolsSchema.push(metadata);

          // Lưu tham chiếu để gọi sau này
          this.toolsMap.set(metadata.name, {
            instance,
            methodName,
          });

          console.log(
            `[Chat Tools Registry] Registered tool: ${metadata.name}`,
          );
        }
      });
    });
  }

  // Hàm thực thi tool từ bất kỳ đâu
  async executeTool(toolName: string, args: any) {
    const tool = this.toolsMap.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    // Gọi hàm từ Service gốc
    return await tool.instance[tool.methodName](args);
  }
}
