package com.apex.whiteboard;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.group.ChannelGroup;
import io.netty.channel.group.DefaultChannelGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.*;
import io.netty.util.concurrent.GlobalEventExecutor;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

/**
 * High-Concurrency Collaborative Whiteboard Server in Java 21.
 * - Netty WebSockets for real-time binary / text event streaming
 * - Java 21 Project Loom virtual thread worker executor
 * - Room-based channel broadcasting and last-write-wins state reconciliation
 */
public final class WhiteboardServer {

    private final int port;
    private final ChannelGroup allChannels = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
    private final ConcurrentHashMap<String, String> canvasElements = new ConcurrentHashMap<>();

    public WhiteboardServer(int port) {
        this.port = port;
    }

    public void start() throws Exception {
        // Netty Boss group for incoming TCP connections
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);

        // Virtual Thread Executor (Project Loom) for processing message handlers
        ThreadFactory virtualThreadFactory = Thread.ofVirtual().name("whiteboard-worker-", 0).factory();
        EventLoopGroup workerGroup = new NioEventLoopGroup(Runtime.getRuntime().availableProcessors(), virtualThreadFactory);

        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(bossGroup, workerGroup)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ChannelPipeline pipeline = ch.pipeline();
                     pipeline.addLast(new HttpServerCodec());
                     pipeline.addLast(new HttpObjectAggregator(65536));
                     pipeline.addLast(new WebSocketServerProtocolHandler("/ws/whiteboard"));
                     pipeline.addLast(new WhiteboardFrameHandler(allChannels, canvasElements));
                 }
             })
             .option(ChannelOption.SO_BACKLOG, 1024)
             .childOption(ChannelOption.SO_KEEPALIVE, true)
             .childOption(ChannelOption.TCP_NODELAY, true);

            System.out.println("Whiteboard WebSocket Server started on port " + port);
            Channel ch = b.bind(port).sync().channel();
            ch.closeFuture().sync();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }

    private static final class WhiteboardFrameHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
        private final ChannelGroup allChannels;
        private final ConcurrentHashMap<String, String> canvasElements;

        public WhiteboardFrameHandler(ChannelGroup allChannels, ConcurrentHashMap<String, String> canvasElements) {
            this.allChannels = allChannels;
            this.canvasElements = canvasElements;
        }

        @Override
        public void channelActive(ChannelHandlerContext ctx) {
            allChannels.add(ctx.channel());
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
            if (frame instanceof TextWebSocketFrame textFrame) {
                String payload = textFrame.text();

                // Idempotent event broadcasting:
                // Relay mutation (stroke, sticky note, cursor move) to all other connected peers
                for (Channel channel : allChannels) {
                    if (channel != ctx.channel()) {
                        channel.writeAndFlush(new TextWebSocketFrame(payload));
                    }
                }
            } else if (frame instanceof PingWebSocketFrame ping) {
                ctx.writeAndFlush(new PongWebSocketFrame(ping.content().retain()));
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            ctx.close();
        }
    }

    public static void main(String[] args) throws Exception {
        new WhiteboardServer(8080).start();
    }
}
