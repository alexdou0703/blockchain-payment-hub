import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/** Socket.IO gateway — clients join rooms by orderId to receive real-time updates */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS client disconnected: ${client.id}`);
  }

  /** Broadcast an event to all subscribers of a room (typically an orderId) */
  emit(room: string, event: string, data: unknown) {
    this.server.to(room).emit(event, data);
  }
}
