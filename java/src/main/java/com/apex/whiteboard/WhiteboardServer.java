package com.apex.whiteboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import io.netty.util.AttributeKey;
import io.netty.util.concurrent.GlobalEventExecutor;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * High-Concurrency Collaborative Whiteboard Server in Java 21.
 * <ul>
 *   <li>Netty WebSockets for real-time text event streaming</li>
 *   <li>Java 21 Project Loom virtual-thread worker executor</li>
 *   <li>Room-based channels, last-write-wins element state, snapshot-on-join</li>
 * </ul>
 *
 * <p>Wire protocol (JSON text frames):
 * <pre>
 *  {"type":"join",   "room":"main","user":"Asha","color":"#38BDF8"}
 *  {"type":"element","room":"main","action":"upsert","element":{...}}  // stored + relayed
 *  {"type":"delete", "room":"main","id":"el-123"}
 *  {"type":"clear",  "room":"main"}
 *  {"type":"cursor", "room":"main","user":"Asha","x":120.5,"y":300.0}  // relayed only
 *  {"type":"leave",  "room":"main"}
 *  {"type":"vote",   "room":"main","question":"q1","option":"B","user":"Asha"}  // stored + tally broadcast
 *  {"type":"tally",  "room":"main","question":"q1"}  // server replies with the stored votes
 *  {"type":"question","room":"main","question":"q2"}  // teacher drives the class quiz, relayed
 *  {"type":"poll",   "room":"main","question":"q1","action":"open|reveal"}  // relayed
 * </pre>
 * The server replies to a join with
 * {@code {"type":"snapshot","room":"main","elements":[...],"votes":{"q1":{"Asha":"B"}}}}
 * so late joiners converge on current state, and broadcasts
 * {@code {"type":"presence","room":"main","event":"join|leave","user":"..."}}.
 */
public final class WhiteboardServer {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AttributeKey<Set<String>> ROOMS = AttributeKey.valueOf("rooms");
    private static final AttributeKey<String> USER = AttributeKey.valueOf("user");

    private final int port;
    private final ConcurrentHashMap<String, Room> rooms = new ConcurrentHashMap<>();

    /** Mutable per-room state: members plus last-write-wins element store. */
    private static final class Room {
        final ChannelGroup members = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
        final ConcurrentHashMap<String, JsonNode> elements = new ConcurrentHashMap<>();
        /** Live-quiz votes: question id -> (voter name -> option A/B/C/D). One vote per voter. */
        final ConcurrentHashMap<String, ConcurrentHashMap<String, String>> votes = new ConcurrentHashMap<>();
    }

    public WhiteboardServer(int port) {
        this.port = port;
    }

    public void start() throws Exception {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);

        // Virtual Thread Executor (Project Loom) for message handling
        EventLoopGroup workerGroup = new NioEventLoopGroup(
                Runtime.getRuntime().availableProcessors(),
                Thread.ofVirtual().name("whiteboard-worker-", 0).factory());

        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(bossGroup, workerGroup)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ch.attr(ROOMS).set(ConcurrentHashMap.newKeySet());
                     ChannelPipeline pipeline = ch.pipeline();
                     pipeline.addLast(new HttpServerCodec());
                     pipeline.addLast(new HttpObjectAggregator(65536));
                     pipeline.addLast(new WebSocketServerProtocolHandler("/ws/whiteboard"));
                     pipeline.addLast(new WhiteboardFrameHandler(rooms));
                 }
             })
             .option(ChannelOption.SO_BACKLOG, 1024)
             .childOption(ChannelOption.SO_KEEPALIVE, true)
             .childOption(ChannelOption.TCP_NODELAY, true);

            System.out.println("Whiteboard WebSocket Server on ws://0.0.0.0:" + port + "/ws/whiteboard");
            Channel ch = b.bind(port).sync().channel();
            ch.closeFuture().sync();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }

    private static final class WhiteboardFrameHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
        private final ConcurrentHashMap<String, Room> rooms;

        WhiteboardFrameHandler(ConcurrentHashMap<String, Room> rooms) {
            this.rooms = rooms;
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
            if (frame instanceof TextWebSocketFrame textFrame) {
                handleMessage(ctx, textFrame.text());
            } else if (frame instanceof PingWebSocketFrame ping) {
                ctx.writeAndFlush(new PongWebSocketFrame(ping.content().retain()));
            } else if (frame instanceof CloseWebSocketFrame) {
                ctx.close();
            }
        }

        private void handleMessage(ChannelHandlerContext ctx, String payload) {
            final JsonNode msg;
            try {
                msg = JSON.readTree(payload);
            } catch (Exception e) {
                sendError(ctx, "invalid JSON");
                return;
            }
            String type = msg.path("type").asText("");
            String roomName = msg.path("room").asText("main");

            switch (type) {
                case "join" -> handleJoin(ctx, roomName, msg);
                case "element" -> handleElement(ctx, roomName, msg);
                case "delete" -> handleDelete(ctx, roomName, msg);
                case "clear" -> handleClear(ctx, roomName, msg);
                case "cursor" -> relay(ctx, roomName, payload);
                case "leave" -> handleLeave(ctx, roomName, payload);
                case "vote" -> handleVote(ctx, roomName, msg);
                case "tally" -> handleTally(ctx, roomName, msg);
                case "question", "poll" -> relay(ctx, roomName, payload);
                default -> sendError(ctx, "unknown message type: " + type);
            }
        }

        private void handleJoin(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            Room room = rooms.computeIfAbsent(roomName, k -> new Room());
            room.members.add(ctx.channel());
            ctx.channel().attr(ROOMS).get().add(roomName);

            // Accept "user" (protocol) and "name" (older clients).
            String user = msg.path("user").asText(msg.path("name").asText("anonymous"));
            ctx.channel().attr(USER).set(user);

            // Snapshot current state to the joiner only.
            ObjectNode snapshot = JSON.createObjectNode();
            snapshot.put("type", "snapshot");
            snapshot.put("room", roomName);
            ArrayNode elements = snapshot.putArray("elements");
            for (JsonNode el : room.elements.values()) {
                elements.add(el);
            }
            ObjectNode votes = snapshot.putObject("votes");
            for (var entry : room.votes.entrySet()) {
                ObjectNode perQuestion = votes.putObject(entry.getKey());
                for (var voter : entry.getValue().entrySet()) {
                    perQuestion.put(voter.getKey(), voter.getValue());
                }
            }
            ctx.writeAndFlush(new TextWebSocketFrame(snapshot.toString()));

            // Tell the room someone arrived.
            ObjectNode presence = JSON.createObjectNode();
            presence.put("type", "presence");
            presence.put("room", roomName);
            presence.put("event", "join");
            presence.put("user", user);
            if (msg.has("color")) {
                presence.put("color", msg.get("color").asText());
            }
            broadcastExcept(room, ctx.channel(), presence.toString());
            System.out.println("[whiteboard] " + user + " joined room '" + roomName + "' (" + room.members.size() + " members)");
        }

        private void handleElement(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            Room room = rooms.get(roomName);
            if (room == null) {
                sendError(ctx, "not in room " + roomName);
                return;
            }
            JsonNode element = msg.get("element");
            String action = msg.path("action").asText("upsert");
            if (element == null || !element.has("id")) {
                sendError(ctx, "element message needs an element with an id");
                return;
            }
            if ("delete".equals(action)) {
                room.elements.remove(element.get("id").asText());
            } else {
                room.elements.put(element.get("id").asText(), element); // last-write-wins
            }
            broadcastExcept(room, ctx.channel(), msg.toString());
        }

        private void handleDelete(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            Room room = rooms.get(roomName);
            if (room == null) {
                sendError(ctx, "not in room " + roomName);
                return;
            }
            String id = msg.path("id").asText("");
            if (id.isEmpty()) {
                sendError(ctx, "delete message needs an id");
                return;
            }
            room.elements.remove(id);
            broadcastExcept(room, ctx.channel(), msg.toString());
        }

        private void handleClear(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            Room room = rooms.get(roomName);
            if (room == null) {
                sendError(ctx, "not in room " + roomName);
                return;
            }
            room.elements.clear();
            broadcastExcept(room, ctx.channel(), msg.toString());
        }

        private void relay(ChannelHandlerContext ctx, String roomName, String payload) {
            Room room = rooms.get(roomName);
            if (room != null) {
                broadcastExcept(room, ctx.channel(), payload);
            }
        }

        private void handleLeave(ChannelHandlerContext ctx, String roomName, String payload) {
            leaveRoom(ctx, roomName);
        }

        /** Live-quiz vote: one vote per voter per question, changeable until the reveal. */
        private void handleVote(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            Room room = rooms.get(roomName);
            if (room == null) {
                sendError(ctx, "not in room " + roomName);
                return;
            }
            String question = msg.path("question").asText("");
            String option = msg.path("option").asText("");
            if (question.isEmpty() || !(option.equals("A") || option.equals("B") || option.equals("C") || option.equals("D"))) {
                sendError(ctx, "vote message needs a question and an option A/B/C/D");
                return;
            }
            String user = msg.path("user").asText("");
            if (user.isEmpty()) {
                String known = ctx.channel().attr(USER).get();
                user = known == null ? "anonymous" : known;
            }
            room.votes.computeIfAbsent(question, k -> new ConcurrentHashMap<>()).put(user, option);

            ObjectNode tallyMsg = JSON.createObjectNode();
            tallyMsg.put("type", "vote");
            tallyMsg.put("room", roomName);
            tallyMsg.put("question", question);
            tallyMsg.put("user", user);
            tallyMsg.put("option", option);
            tallyMsg.set("tally", tallyNode(room, question));
            broadcastExcept(room, ctx.channel(), tallyMsg.toString());
        }

        /** A client asks for the stored votes of one question; reply to the requester only. */
        private void handleTally(ChannelHandlerContext ctx, String roomName, JsonNode msg) {
            String question = msg.path("question").asText("");
            Room room = rooms.get(roomName);
            ObjectNode reply = JSON.createObjectNode();
            reply.put("type", "tally");
            reply.put("room", roomName);
            reply.put("question", question);
            if (room != null && !question.isEmpty()) {
                ObjectNode votersNode = reply.putObject("voters");
                for (var voter : room.votes.getOrDefault(question, new ConcurrentHashMap<>()).entrySet()) {
                    votersNode.put(voter.getKey(), voter.getValue());
                }
                reply.set("tally", tallyNode(room, question));
            } else {
                reply.putObject("voters");
                reply.set("tally", tallyNode(null, question));
            }
            ctx.writeAndFlush(new TextWebSocketFrame(reply.toString()));
        }

        private ObjectNode tallyNode(Room room, String question) {
            ObjectNode tally = JSON.createObjectNode();
            int a = 0, b = 0, c = 0, d = 0;
            if (room != null) {
                for (String option : room.votes.getOrDefault(question, new ConcurrentHashMap<>()).values()) {
                    switch (option) {
                        case "A" -> a++;
                        case "B" -> b++;
                        case "C" -> c++;
                        case "D" -> d++;
                        default -> {
                        }
                    }
                }
            }
            tally.put("A", a);
            tally.put("B", b);
            tally.put("C", c);
            tally.put("D", d);
            return tally;
        }

        private void leaveRoom(ChannelHandlerContext ctx, String roomName) {
            Room room = rooms.get(roomName);
            if (room == null) {
                return;
            }
            room.members.remove(ctx.channel());
            ctx.channel().attr(ROOMS).get().remove(roomName);

            ObjectNode presence = JSON.createObjectNode();
            presence.put("type", "presence");
            presence.put("room", roomName);
            presence.put("event", "leave");
            String user = ctx.channel().attr(USER).get();
            presence.put("user", user == null ? "anonymous" : user);
            broadcastExcept(room, ctx.channel(), presence.toString());
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            Set<String> joined = ctx.channel().attr(ROOMS).get();
            if (joined != null) {
                for (String roomName : joined.toArray(new String[0])) {
                    leaveRoom(ctx, roomName);
                }
            }
        }

        private void broadcastExcept(Room room, Channel sender, String payload) {
            TextWebSocketFrame frame = new TextWebSocketFrame(payload);
            for (Channel ch : room.members) {
                if (ch != sender && ch.isActive()) {
                    ch.writeAndFlush(frame.retainedDuplicate());
                }
            }
            frame.release();
        }

        private void sendError(ChannelHandlerContext ctx, String message) {
            ObjectNode err = JSON.createObjectNode();
            err.put("type", "error");
            err.put("message", message);
            ctx.writeAndFlush(new TextWebSocketFrame(err.toString()));
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            ctx.close();
        }
    }

    public static void main(String[] args) throws Exception {
        int port = 8090; // the web workbench connects to ws://<host>:8090
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("usage: WhiteboardServer [port]");
                return;
            }
        }
        new WhiteboardServer(port).start();
    }
}
